#!/usr/bin/env node
/*
 * The follow-up agent: a caller nobody reached gets one text from the shop.
 * Never twice, never at night, never to an emergency, a booked customer or a
 * STOP, and a reply lands on the lead it answers instead of a second lead.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const {
  FOLLOW_UP_AFTER_MS,
  followUpBlock,
  followUpMessage,
  isShopDaytime,
  previewFollowUp,
  runAutoFollowUps,
  sendLeadFollowUp,
} = await import("../src/lib/lead-follow-up.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
/* 2pm in Chicago: inside the shop's day. */
const AFTERNOON = new Date("2026-09-29T19:00:00Z");
const hoursBefore = (at, h) => new Date(at.getTime() - h * 3_600_000);

function fakeSms() {
  const sent = [];
  const send = async (params) => {
    sent.push(params);
    return { sent: true, sid: `SM${sent.length}` };
  };
  return { sent, send };
}

async function shop(mode = "ask") {
  return prisma.business.create({
    data: {
      name: "Cole Heating",
      slug: `fu-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      vapiPhoneNumber: randomPhone(),
      followUpMode: mode,
      // "auto" shops are swept by the cron; test shops are skipped there, so the sweep tests use "live".
      environment: "live",
    },
  });
}

async function lead(business, overrides = {}) {
  const phone = overrides.phone ?? randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  return prisma.lead.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      name: "Ann Cole",
      phone,
      serviceType: "AC not cooling",
      urgency: "this-week",
      status: "new",
      createdAt: overrides.createdAt ?? hoursBefore(AFTERNOON, 4),
      ...overrides.data,
    },
  });
}

const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("the text: short, from the shop, one ask, a way out", () => {
  const message = followUpMessage({ businessName: "Cole Heating", name: "Ann Cole", serviceType: "AC not cooling", callbackPhone: "+13125550199" });
  assert.equal(
    message,
    "Hi Ann, it's Cole Heating following up on your call about AC not cooling. Still need a hand? Reply with a day and time that suits you and we'll get you on the schedule, or call us at +1 312 555 0199. Reply STOP to opt out.",
  );
  assert.ok(message.length <= 320, "two SMS segments at most");
  assert.match(followUpMessage({ businessName: "Cole Heating", name: "Ann", serviceType: "No heat", callbackPhone: null }), /about no heat\./);
  const bare = followUpMessage({ businessName: "Cole Heating", name: null, serviceType: "SMS inquiry", callbackPhone: null });
  assert.match(bare, /^Hi, it's Cole Heating following up on your call\. /);
  assert.match(bare, /schedule\. Reply STOP to opt out\.$/);
});

test("who gets one: unworked service leads between three hours and three days", () => {
  const base = {
    status: "new",
    phone: "+15125550101",
    urgency: "this-week",
    categoryCode: "hvac.cooling",
    createdAt: hoursBefore(AFTERNOON, 4),
    firstContactedAt: null,
    followUpSentAt: null,
    job: null,
  };
  assert.equal(followUpBlock(base, AFTERNOON), null);
  assert.equal(followUpBlock({ ...base, createdAt: hoursBefore(AFTERNOON, 1) }, AFTERNOON), "too_soon");
  assert.equal(followUpBlock({ ...base, createdAt: hoursBefore(AFTERNOON, 1) }, AFTERNOON, { ignoreTooSoon: true }), null, "an owner may send early");
  assert.equal(followUpBlock({ ...base, createdAt: hoursBefore(AFTERNOON, 80) }, AFTERNOON), "too_old");
  assert.equal(followUpBlock({ ...base, urgency: "emergency" }, AFTERNOON), "emergency");
  assert.equal(followUpBlock({ ...base, categoryCode: "other.non_service" }, AFTERNOON), "not_service");
  assert.equal(followUpBlock({ ...base, status: "contacted" }, AFTERNOON), "worked");
  assert.equal(followUpBlock({ ...base, firstContactedAt: AFTERNOON }, AFTERNOON), "worked");
  assert.equal(followUpBlock({ ...base, job: { id: "j" } }, AFTERNOON), "booked");
  assert.equal(followUpBlock({ ...base, phone: null }, AFTERNOON), "no_phone");
  assert.equal(followUpBlock({ ...base, followUpSentAt: AFTERNOON }, AFTERNOON), "already_sent");
});

test("daytime is the shop's daytime", () => {
  assert.equal(isShopDaytime(new Date("2026-09-29T19:00:00Z"), "America/Chicago"), true); // 2pm
  assert.equal(isShopDaytime(new Date("2026-09-30T03:00:00Z"), "America/Chicago"), false); // 10pm
  assert.equal(isShopDaytime(new Date("2026-09-29T13:30:00Z"), "America/Chicago"), false); // 8:30am
  assert.equal(isShopDaytime(new Date("2026-09-29T13:30:00Z"), "America/New_York"), true); // 9:30am
});

test("an owner's tap sends it once; a second tap or a racing cron sends nothing", async () => {
  const business = await shop("ask");
  try {
    const row = await lead(business);
    const sms = fakeSms();
    const by = { actor: "owner", actorEmail: "owner@example.test" };
    const preview = await previewFollowUp(business.id, row.id, AFTERNOON);
    assert.equal(preview.canSend, true);

    const results = await Promise.all([
      sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: sms.send }),
      sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: sms.send }),
    ]);
    assert.equal(results.filter((r) => r.sent).length, 1);
    assert.equal(sms.sent.length, 1, "the customer gets one text");
    assert.equal(sms.sent[0].to, row.phone);
    assert.match(sms.sent[0].body, /^Hi Ann, it's Cole Heating/);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: row.id } });
    assert.ok(after.followUpSentAt);
    assert.equal(after.status, "new", "a text is not the shop reaching them");
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "lead.follow_up_sent" } });
    assert.equal(audit.actor, "owner");
    assert.equal((await previewFollowUp(business.id, row.id, AFTERNOON)).canSend, false);
  } finally {
    await drop(business.id);
  }
});

test("a text that did not go out frees the lead for another try", async () => {
  const business = await shop("ask");
  try {
    const row = await lead(business);
    const by = { actor: "owner", actorEmail: "owner@example.test" };
    const off = await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON });
    assert.deepEqual(off, { sent: false, reason: "Texting is not switched on for this shop yet." });
    const stop = await sendLeadFollowUp({
      businessId: business.id,
      leadId: row.id,
      by,
      now: AFTERNOON,
      send: async () => ({ sent: false, reason: "customer_opted_out" }),
    });
    assert.deepEqual(stop, { sent: false, reason: "This customer texted STOP." });
    const thrown = await sendLeadFollowUp({
      businessId: business.id,
      leadId: row.id,
      by,
      now: AFTERNOON,
      send: async () => {
        throw new Error("Twilio 400");
      },
    });
    assert.equal(thrown.sent, false);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: row.id } })).followUpSentAt, null);
    const sms = fakeSms();
    assert.equal((await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: sms.send })).sent, true);
  } finally {
    await drop(business.id);
  }
});

test("never at night, never when off, never to a customer who booked or was texted this week", async () => {
  const business = await shop("ask");
  try {
    const sms = fakeSms();
    const by = { actor: "owner", actorEmail: "owner@example.test" };
    const row = await lead(business);
    const night = new Date("2026-09-30T04:00:00Z");
    assert.match((await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: night, send: sms.send })).reason, /9am and 8pm/);

    await prisma.job.create({ data: { businessId: business.id, customerId: row.customerId, title: "AC", status: "scheduled", createdAt: AFTERNOON } });
    assert.equal((await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: sms.send })).reason, "Already booked.");

    const phone = randomPhone();
    const first = await lead(business, { phone });
    const second = await prisma.lead.create({
      data: { businessId: business.id, name: "Ann Cole", phone: `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`, status: "new", createdAt: hoursBefore(AFTERNOON, 4) },
    });
    assert.equal((await sendLeadFollowUp({ businessId: business.id, leadId: first.id, by, now: AFTERNOON, send: sms.send })).sent, true);
    assert.match((await sendLeadFollowUp({ businessId: business.id, leadId: second.id, by, now: AFTERNOON, send: sms.send })).reason, /last week/);

    await prisma.business.update({ where: { id: business.id }, data: { followUpMode: "off" } });
    const third = await lead(business);
    assert.match((await sendLeadFollowUp({ businessId: business.id, leadId: third.id, by, now: AFTERNOON, send: sms.send })).reason, /off in Settings/);
    assert.equal(sms.sent.length, 1);
  } finally {
    await drop(business.id);
  }
});

test("auto shops: the cron texts leads that waited, and only in \"auto\"", async () => {
  const auto = await shop("auto");
  const ask = await shop("ask");
  try {
    const due = await lead(auto);
    const fresh = await lead(auto, { createdAt: new Date(AFTERNOON.getTime() - FOLLOW_UP_AFTER_MS + 60_000) });
    const emergency = await lead(auto, { data: { urgency: "emergency" } });
    const askLead = await lead(ask);
    const sms = fakeSms();
    await runAutoFollowUps({ now: AFTERNOON, send: sms.send });
    const texted = new Set(sms.sent.map((s) => s.to));
    assert.ok(texted.has(due.phone));
    assert.ok(!texted.has(fresh.phone), "not before three hours");
    assert.ok(!texted.has(emergency.phone), "emergencies get a call");
    assert.ok(!texted.has(askLead.phone), "\"ask\" shops send only when the owner taps");
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: auto.id, action: "lead.follow_up_sent" } });
    assert.equal(audit.actor, "orvius");

    const again = fakeSms();
    await runAutoFollowUps({ now: new Date(AFTERNOON.getTime() + 30 * 60_000), send: again.send });
    assert.ok(!again.sent.some((s) => s.to === due.phone), "the next sweep does not text them again");
  } finally {
    await drop(auto.id);
    await drop(ask.id);
  }
});

test("a reply lands on the lead it answers, not as a second lead", async () => {
  const business = await shop("ask");
  try {
    const row = await lead(business);
    await prisma.lead.update({ where: { id: row.id }, data: { followUpSentAt: hoursBefore(new Date(), 1) } });
    const { POST } = await import("../src/app/api/webhooks/twilio/sms/route.ts");
    const { NextRequest } = await import("next/server");
    const text = (Body, MessageSid) =>
      POST(
        new NextRequest("http://localhost/api/webhooks/twilio/sms", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ From: row.phone, To: business.vapiPhoneNumber, Body, MessageSid }),
        }),
      );
    const sid = `SM${stamp()}`;
    const res = await text("Thursday after 2 works", sid);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /lock in a time/);
    await text("Thursday after 2 works", sid);
    const hazard = await text("also it smells like gas in the basement", `SM${stamp()}`);
    assert.match(await hazard.text(), /call 911/);
    const leads = await prisma.lead.findMany({ where: { businessId: business.id } });
    assert.equal(leads.length, 1, "no duplicate lead for the reply");
    assert.ok(leads[0].followUpRepliedAt);
    assert.equal(leads[0].notes.match(/Thursday after 2 works/g).length, 1, "a redelivered text is recorded once");
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "lead.follow_up_replied" } }));
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
