#!/usr/bin/env node
/*
 * Win-back: the owner texts customers who haven't been back. Only real past
 * customers, never someone already booked, never past a STOP, once per 90
 * days, daytime only, and the replies are the owner's conversation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { renderWinBack, defaultWinBackMessage, winBackAudience, sendWinBack, WIN_BACK_GAP_MS } = await import("../src/lib/win-back.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
/* 2pm in Chicago. */
const AFTERNOON = new Date("2026-09-29T19:00:00Z");
const monthsAgo = (m) => new Date(AFTERNOON.getTime() - m * 30 * 86_400_000);
const by = { actor: "owner", actorEmail: "owner@example.test" };

function fakeSms() {
  const sent = [];
  return { sent, send: async (p) => (sent.push(p), { sent: true, sid: `SM${sent.length}` }) };
}

async function shop({ ownCampaign = true, ...overrides } = {}) {
  const business = await prisma.business.create({
    data: { name: "Luxe Hair Studio", slug: `wb-${stamp()}`, trade: "Salon", hoursJson: "{}", servicesJson: "[]", timezone: "America/Chicago", ...overrides },
  });
  if (ownCampaign) {
    await prisma.shopTexting.create({
      data: { businessId: business.id, status: "approved", detailsJson: "{}", messagingServiceSid: `MG${stamp()}` },
    });
  }
  return business;
}

async function customer(business, { name = "Ann Cole", seen = 8, completed = true, upcoming = false, ...data } = {}) {
  const phone = randomPhone();
  const c = await prisma.customer.create({
    data: { businessId: business.id, name, phone, phoneNormalized: phone, lastSeenAt: monthsAgo(seen), marketingOptInAt: monthsAgo(seen + 1), ...data },
  });
  if (completed) {
    await prisma.job.create({ data: { businessId: business.id, customerId: c.id, title: "Cut", status: "completed", completedAt: monthsAgo(seen) } });
  }
  if (upcoming) {
    await prisma.job.create({
      data: { businessId: business.id, customerId: c.id, title: "Color", status: "scheduled", scheduledAt: new Date(AFTERNOON.getTime() + 3 * 86_400_000) },
    });
  }
  return c;
}

test("the message: first name, shop, link, and always a way out", () => {
  const withLink = renderWinBack(defaultWinBackMessage(true), { name: "Ann Cole", businessName: "Luxe Hair Studio", link: "https://o.example/b/luxe" });
  assert.equal(
    withLink,
    "Hi Ann, it's Luxe Hair Studio. It's been a while since your last visit. Want us to get you on the schedule? Book here: https://o.example/b/luxe Reply STOP to opt out.",
  );
  assert.match(renderWinBack(defaultWinBackMessage(false), { name: null, businessName: "Luxe", link: null }), /^Hi, it's Luxe\./);
  assert.match(renderWinBack("Miss you {first}!", { name: "Bo", businessName: "Luxe", link: null }), /Miss you Bo! Reply STOP to opt out\.$/, "STOP is added if the owner left it out");
});

test("who is in the audience", async () => {
  const business = await shop();
  try {
    const lapsed = await customer(business, { name: "Ann Cole", seen: 8 });
    await customer(business, { name: "Recent Visit", seen: 1 });
    await customer(business, { name: "Never Booked", seen: 8, completed: false });
    await customer(business, { name: "Already Booked", seen: 8, upcoming: true });
    await customer(business, { name: "Never Said Yes", seen: 8, marketingOptInAt: null });
    await customer(business, { name: "Asked Lately", seen: 8, winBackSentAt: new Date(AFTERNOON.getTime() - WIN_BACK_GAP_MS / 3) });
    const stopped = await customer(business, { name: "Said Stop", seen: 8 });
    await prisma.smsOptOut.create({ data: { businessId: business.id, phone: stopped.phone, phoneNormalized: stopped.phoneNormalized, source: "inbound-sms" } });
    const askedLongAgo = await customer(business, { name: "Asked Long Ago", seen: 13, winBackSentAt: new Date(AFTERNOON.getTime() - WIN_BACK_GAP_MS - 86_400_000) });

    const six = await winBackAudience(business.id, 6, AFTERNOON);
    assert.deepEqual(six.map((c) => c.id).sort(), [lapsed.id, askedLongAgo.id].sort());
    const twelve = await winBackAudience(business.id, 12, AFTERNOON);
    assert.deepEqual(twelve.map((c) => c.id), [askedLongAgo.id]);

    const other = await shop();
    try {
      assert.deepEqual(await winBackAudience(other.id, 3, AFTERNOON), [], "never another shop's customers");
    } finally {
      await drop(other.id);
    }
  } finally {
    await drop(business.id);
  }
});

test("a send texts each once as the owner, and a second send the same day texts nobody", async () => {
  const business = await shop();
  try {
    await customer(business, { name: "Ann Cole" });
    await customer(business, { name: "Bob Diaz" });
    const sms = fakeSms();
    const first = await sendWinBack({ businessId: business.id, months: 6, template: defaultWinBackMessage(false), by, now: AFTERNOON, send: sms.send });
    assert.deepEqual(first, { ok: true, sent: 2, skipped: 0, remaining: 0 });
    assert.ok(sms.sent.every((s) => s.author === "owner"), "replies route to the owner");
    assert.ok(sms.sent.some((s) => /^Hi Bob, it's Luxe Hair Studio/.test(s.body)));

    const again = fakeSms();
    const second = await sendWinBack({ businessId: business.id, months: 6, template: "Hi again", by, now: AFTERNOON, send: again.send });
    assert.equal(second.ok && second.sent, 0);
    assert.equal(again.sent.length, 0);
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "customers.win_back_sent" } }));
  } finally {
    await drop(business.id);
  }
});

test("promotional texts never go out on the shared Orvius number or before the shop's own registration is approved", async () => {
  const held = await shop({ ownCampaign: false });
  try {
    const c = await customer(held);
    const sms = fakeSms();
    const result = await sendWinBack({ businessId: held.id, months: 6, template: "Hi {first}", by, now: AFTERNOON, send: sms.send });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "held");
    assert.equal(sms.sent.length, 0);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).winBackSentAt, null, "nothing is marked sent");
  } finally {
    await drop(held.id);
  }
});

test("a verified shared sender still does not carry a promotional text", async () => {
  const before = { number: process.env.TWILIO_PHONE_NUMBER, service: process.env.TWILIO_MESSAGING_SERVICE_SID };
  process.env.TWILIO_PHONE_NUMBER = "+18885550100";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  const identity = "number:+18885550100";
  await prisma.messagingSender.upsert({
    where: { identity },
    create: { identity, kind: "toll_free", status: "verified", evidence: "test", checkedAt: new Date(), recordedBy: "test" },
    update: { status: "verified" },
  });
  const business = await shop({ ownCampaign: false });
  try {
    await customer(business);
    const sms = fakeSms();
    const result = await sendWinBack({ businessId: business.id, months: 6, template: "Hi {first}", by, now: AFTERNOON, send: sms.send });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "shared_sender");
    assert.equal(sms.sent.length, 0);
  } finally {
    await prisma.messagingSender.deleteMany({ where: { identity } });
    if (before.number === undefined) delete process.env.TWILIO_PHONE_NUMBER;
    else process.env.TWILIO_PHONE_NUMBER = before.number;
    if (before.service !== undefined) process.env.TWILIO_MESSAGING_SERVICE_SID = before.service;
    await drop(business.id);
  }
});

test("not at night, not empty, and an unsent text is released", async () => {
  const business = await shop();
  try {
    const c = await customer(business);
    const night = await sendWinBack({ businessId: business.id, months: 6, template: "Hi", by, now: new Date("2026-09-30T04:00:00Z"), send: fakeSms().send });
    assert.equal(night.ok, false);
    assert.equal(night.reason, "night");
    assert.equal((await sendWinBack({ businessId: business.id, months: 6, template: "  ", by, now: AFTERNOON })).reason, "empty_message");

    const down = async () => ({ sent: false, reason: "sms_not_configured" });
    const result = await sendWinBack({ businessId: business.id, months: 6, template: "Hi {first}", by, now: AFTERNOON, send: down });
    assert.equal(result.ok && result.sent, 0);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).winBackSentAt, null);
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
