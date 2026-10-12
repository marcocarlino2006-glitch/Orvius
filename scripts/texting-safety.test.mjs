#!/usr/bin/env node
/*
 * Texting that never surprises anyone: a keyword is the whole message, a
 * plain "yes" is a reply to the shop, a burst of texts is one request with
 * one auto-reply, a tech is crew, opted-out and Orvius-owned numbers are
 * never texted, an owner's text says who it's from, and reminders wait for
 * daytime.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { parseSmsKeyword, isBareYes } = await import("../src/lib/sms-keywords.ts");
const { sendSms } = await import("../src/lib/twilio-sms.ts");
const { sendCustomerSms } = await import("../src/lib/customer-sms.ts");
const { POST } = await import("../src/app/api/webhooks/twilio/sms/route.ts");
const { NextRequest } = await import("next/server");

const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

async function shop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Summit Heating",
      slug: `txt-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      vapiPhoneNumber: randomPhone(),
      ownerPhone: randomPhone(),
      ownerEmail: `owner-${stamp()}@example.test`,
      ...overrides,
    },
  });
}

const text = (business, From, Body, MessageSid = `SM${stamp()}`) =>
  POST(
    new NextRequest("http://localhost/api/webhooks/twilio/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From, To: business.vapiPhoneNumber, Body, MessageSid }),
    }),
  );

test("a keyword is the whole message; customers talking to the shop are never unsubscribed", () => {
  for (const body of ["STOP", "stop!", "Stop.", "unsubscribe", "Cancel", "END", "quit", "stop all", "opt out", "Stop texting me", "please stop texting me", "Please remove me from your list", "don't text me", "stop please"]) {
    assert.equal(parseSmsKeyword(body), "stop", body);
  }
  for (const body of ["Cancel my appointment", "cancel please", "End of day works", "Quit by 5?", "Stop by after 3", "Help, my furnace died", "Info on a new AC?", "Yes that works", "yes", "Start time?"]) {
    assert.equal(parseSmsKeyword(body), null, body);
  }
  assert.equal(parseSmsKeyword("HELP"), "help");
  assert.equal(parseSmsKeyword("info"), "help");
  assert.equal(parseSmsKeyword("START"), "start");
  assert.equal(parseSmsKeyword("unstop"), "start");
  assert.equal(isBareYes("Yes!"), true);
  assert.equal(isBareYes("Yes that works"), false);
});

test("'Cancel my appointment' and 'Help, no heat' reach the shop as requests, not keywords", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const res = await text(business, phone, "Help, my furnace died and it's 40 degrees inside");
    assert.match(await res.text(), /Thanks for contacting us/);
    const other = randomPhone();
    assert.match(await (await text(business, other, "Cancel my appointment please")).text(), /Thanks for contacting us/);
    assert.equal(await prisma.lead.count({ where: { businessId: business.id, phone: { in: [phone, other] } } }), 2);
    const optOut = await prisma.smsOptOut.count({ where: { businessId: business.id, clearedAt: null } });
    assert.equal(optOut, 0);
  } finally {
    await drop(business.id);
  }
});

test("a bare YES is a reply unless the number is opted out, when it re-subscribes", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const first = await (await text(business, phone, "Yes")).text();
    assert.doesNotMatch(first, /re-subscribed/);

    await text(business, phone, "STOP");
    const row = await prisma.smsOptOut.findFirst({ where: { businessId: business.id, phone } });
    assert.ok(row && !row.clearedAt, "STOP opts out");
    const back = await (await text(business, phone, "yes")).text();
    assert.match(back, /re-subscribed/);
    const cleared = await prisma.smsOptOut.findFirst({ where: { businessId: business.id, phone } });
    assert.ok(cleared.clearedAt, "YES from an opted-out number clears it");
  } finally {
    await drop(business.id);
  }
});

test("'Cancel' from a customer with a visit coming up unsubscribes them and tells the owner", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const customer = await prisma.customer.create({
      data: { businessId: business.id, phone, phoneNormalized: phone, name: "Dana Kim" },
    });
    await prisma.job.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        title: "AC not cooling",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      },
    });
    const sid = `SM${stamp()}`;
    assert.match(await (await text(business, phone, "Cancel", sid)).text(), /unsubscribed/);
    const alert = await prisma.ownerNotification.findFirst({
      where: { businessId: business.id, dedupeKey: `cancel-word:${sid}` },
    });
    assert.ok(alert, "owner hears it");
    assert.match(alert.message, /Dana Kim texted "Cancel" and is now unsubscribed/);
    assert.match(alert.message, /If they meant the visit, call them/);
  } finally {
    await drop(business.id);
  }
});

test("a burst of texts is one request with one auto-reply, so auto-responders can't loop", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const replies = [];
    for (const body of ["hi", "furnace is out", "1840 Oak Ave Evanston 60201"]) {
      replies.push(await (await text(business, phone, body)).text());
    }
    assert.match(replies[0], /Thanks for contacting us/);
    assert.doesNotMatch(replies[1], /Thanks for contacting us/);
    assert.doesNotMatch(replies[2], /Thanks for contacting us/);
    const leads = await prisma.lead.findMany({ where: { businessId: business.id, phone } });
    assert.equal(leads.length, 1);
    assert.match(leads[0].notes, /hi\nfurnace is out\n1840 Oak Ave/);
    const alerts = await prisma.ownerNotification.findMany({
      where: { businessId: business.id, dedupeKey: { startsWith: "sms-more:" }, channel: "sms" },
    });
    assert.equal(alerts.length, 2, "the owner sees each follow-on text");

    for (let i = 0; i < 8; i++) await text(business, phone, `auto-reply ${i}`);
    const quiet = await prisma.ownerNotification.count({
      where: { businessId: business.id, dedupeKey: { startsWith: "sms-more:" }, channel: "sms" },
    });
    assert.ok(quiet <= 6, `a looping sender stops alerting the owner (got ${quiet})`);
  } finally {
    await drop(business.id);
  }
});

test("a gas smell in a follow-on text still gets the safety reply and a SAFETY alert", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    await text(business, phone, "hi is anyone there");
    const reply = await (await text(business, phone, "I smell gas in the basement")).text();
    assert.match(reply, /call 911/);
    const alert = await prisma.ownerNotification.findFirst({
      where: { businessId: business.id, dedupeKey: { startsWith: "sms-more:" }, channel: "sms" },
    });
    assert.match(alert.message, /^SAFETY/);
  } finally {
    await drop(business.id);
  }
});

test("a technician's text goes to the owner as crew, never as a new customer", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    await prisma.technician.create({ data: { businessId: business.id, name: "Luis", phone: phone.replace("+1", "") } });
    const reply = await (await text(business, phone, "Running 15 late to the Kim job")).text();
    assert.doesNotMatch(reply, /Thanks for contacting us/);
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 0);
    const alert = await prisma.ownerNotification.findFirst({
      where: { businessId: business.id, dedupeKey: { startsWith: "tech-text:" } },
    });
    assert.match(alert.message, /^Luis \(your tech\) texted: Running 15 late/);
  } finally {
    await drop(business.id);
  }
});

test("opted-out people and Orvius's own lines are never texted, for any audience", async () => {
  const business = await shop({ environment: "demo" });
  const other = await shop();
  try {
    const phone = randomPhone();
    assert.ok(await sendSms({ to: phone, body: "hi", businessId: business.id, audience: "tech" }), "a normal send goes");
    await prisma.smsOptOut.create({
      data: { businessId: business.id, phone, phoneNormalized: phone, source: "inbound-sms" },
    });
    for (const audience of ["tech", "customer", "owner"]) {
      assert.equal(await sendSms({ to: phone, body: "hi", businessId: business.id, audience }), null, audience);
    }
    assert.equal(
      await sendSms({ to: other.vapiPhoneNumber, body: "hi", businessId: business.id, audience: "customer" }),
      null,
      "another shop's Orvius line",
    );
  } finally {
    await drop(business.id);
    await drop(other.id);
  }
});

test("an owner's text carries the shop name, and the opt-out line only on the first in a month", async () => {
  const business = await shop({ environment: "demo" });
  try {
    const phone = randomPhone();
    assert.equal((await sendCustomerSms({ businessId: business.id, to: phone, body: "Running 10 min late", author: "owner" })).sent, true);
    assert.equal((await sendCustomerSms({ businessId: business.id, to: phone, body: "Here now", author: "owner" })).sent, true);
    assert.equal(
      (await sendCustomerSms({ businessId: business.id, to: phone, body: "Summit Heating here, all done", author: "owner" })).sent,
      true,
    );
    const sent = await prisma.message.findMany({
      where: { businessId: business.id, direction: "out" },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(sent[0].body, "Summit Heating: Running 10 min late\n\nReply STOP to opt out. Msg&data rates may apply.");
    assert.equal(sent[1].body, "Summit Heating: Here now");
    assert.equal(sent[2].body, "Summit Heating here, all done", "no double name");
  } finally {
    await drop(business.id);
  }
});

test("recipient refusals never fall back to another sender, and a carrier STOP is written down", () => {
  const src = read("src/lib/twilio-sms.ts");
  assert.match(src, /if \(RECIPIENT_REFUSED\.has\(twilioErrorCode\(error\) \?\? 0\)\) throw error;/);
  assert.match(src, /twilioErrorCode\(error\) === UNSUBSCRIBED_RECIPIENT\) \{\n\s+await recordCarrierOptOut/);
});

test("confirmation reminders wait for the shop's daytime, from the 30-minute sweep, for live shops only", async () => {
  const src = read("src/lib/customer-confirm.ts");
  assert.match(src, /timezone: \{ in: daytime \}/);
  assert.match(src, /business: \{ isActive: true, environment: \{ not: "test" \}/);
  assert.match(read("src/lib/line-watch-sweep.ts"), /sendDueCustomerConfirmationReminders\(new Date\(\), 25\)/);
  assert.doesNotMatch(read("src/app/api/cron/notifications/route.ts"), /sendDueCustomerConfirmationReminders/);
  assert.match(read("vercel.json"), /"schedule": "0 17 \* \* \*"/);

  const { sendDueCustomerConfirmationReminders } = await import("../src/lib/customer-confirm.ts");
  const business = await shop({ environment: "demo", timezone: "Pacific/Kiritimati" });
  try {
    const phone = randomPhone();
    const customer = await prisma.customer.create({ data: { businessId: business.id, phone, phoneNormalized: phone } });
    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        title: "Tune-up",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 5 * 86_400_000),
        customerConfirmSentAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const at = (hour) => {
      const d = new Date();
      d.setUTCHours((hour - 14 + 24) % 24, 0, 0, 0);
      return d;
    };
    await sendDueCustomerConfirmationReminders(at(2), 25);
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).customerConfirmReminderSentAt, null, "2am: nothing");
    await sendDueCustomerConfirmationReminders(at(11), 25);
    assert.ok((await prisma.job.findUnique({ where: { id: job.id } })).customerConfirmReminderSentAt, "11am: sent");
  } finally {
    await drop(business.id);
  }
});

test("plan reminders page past members whose visit is already booked", () => {
  const src = read("src/lib/service-plans.ts");
  assert.match(src, /timezone: \{ in: params\.daytime \}/);
  assert.match(src, /nextVisitDueAt: after\.at, id: \{ gt: after\.id \}/);
});

test.after(() => prisma.$disconnect());
