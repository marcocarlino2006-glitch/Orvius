#!/usr/bin/env node
/*
 * Capabilities are separate and honest: what the owner asked for is "on" only
 * when its prerequisites are on record, and the report agrees with what the
 * real call, booking-page, follow-up and payment paths do. Each case below
 * makes one prerequisite missing and checks both the report and the path.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) delete process.env[key];

const { loadCapabilities, bookingReadiness, openDays } = await import("../src/lib/capabilities.ts");
const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { OWNER_SETS_TIMES_REPLY, CALENDAR_UNREADABLE_REPLY } = await import("../src/lib/in-call-tool-defs.ts");
const { bookingSlots, bookOnline } = await import("../src/lib/online-booking.ts");
const { runAutoFollowUps } = await import("../src/lib/lead-follow-up.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const phone = () => `+1312${7_000_000 + Math.floor(Math.random() * 2_000_000)}`;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const OPEN = JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, { open: "00:00", close: "23:59" }])));
const CLOSED = JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, { open: "08:00", close: "17:00", closed: true }])));
const created = [];
after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function shop(data = {}) {
  const row = await prisma.business.create({
    data: {
      name: `Cap ${stamp()}`,
      slug: `cap-${stamp()}`,
      trade: "HVAC",
      hoursJson: OPEN,
      servicesJson: "[]",
      timezone: "America/Chicago",
      environment: "production",
      ownerPhone: phone(),
      ownerEmail: `o-${stamp()}@example.test`,
      bookingPageOn: true,
      ...data,
    },
  });
  created.push(row.id);
  return row;
}
const cap = (caps, id) => caps.find((c) => c.id === id);
const ask = async (s, name = "check_availability", args = { serviceType: "AC tune-up", urgency: "this-week" }) => {
  const call = await prisma.call.create({ data: { businessId: s.id, vapiCallId: `v-${stamp()}`, callerPhone: phone() } });
  const [r] = await handleInCallToolCalls({ shop: s, callId: call.id, toolCalls: [{ id: "t", name, args }] });
  return r.result;
};
const offersATime = (reply) => /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(reply);

test("open days count only real open windows", () => {
  assert.equal(openDays(OPEN), 7);
  assert.equal(openDays(CLOSED), 0);
  assert.equal(openDays("{}"), 0);
  assert.equal(openDays("not json"), 0);
  assert.equal(openDays(JSON.stringify({ monday: { open: "17:00", close: "08:00" } })), 0, "a window that closes before it opens is not open");
});

test("no open hours: booking is waiting, and neither the call nor the booking page offers a time", async () => {
  const s = await shop({ hoursJson: CLOSED });
  const booking = cap(await loadCapabilities(s.id), "booking");
  assert.deepEqual([booking.requested, booking.state], [true, "pending"]);
  assert.match(booking.detail, /No open hours/);
  assert.match(booking.meanwhile, /you set the time/);
  assert.equal(offersATime(await ask(s)), false);
  assert.deepEqual(await bookingSlots(s, "AC tune-up"), []);
});

test("travel policy not chosen: waiting, the call hands the time to the owner, the booking page refuses", async () => {
  const s = await shop();
  await prisma.shopOperatingPolicy.create({ data: { businessId: s.id, travelMode: "not_configured" } });
  const booking = cap(await loadCapabilities(s.id), "booking");
  assert.equal(booking.state, "pending");
  assert.equal((await bookingReadiness(s)).block, "policy_not_set");
  assert.equal(await ask(s), OWNER_SETS_TIMES_REPLY);
  const tomorrow = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const result = await bookOnline(s, { serviceType: (await import("../src/lib/online-booking.ts")).bookingServices(s)[0], at: tomorrow, name: "Ann", phone: phone() });
  assert.deepEqual([result.ok, result.reason], [false, "owner_sets_times"]);
});

test("a connected busy calendar never read: waiting, and the call says it can't read the schedule", async () => {
  const s = await shop({ busyCalendarUrl: "https://calendar.example.test/busy.ics", busyCalendarSyncedAt: null });
  const booking = cap(await loadCapabilities(s.id), "booking");
  assert.equal(booking.state, "pending");
  assert.match(booking.detail, /busy calendar/);
  assert.equal(await ask(s), CALENDAR_UNREADABLE_REPLY);
});

test("alert mode is off, not waiting; everything in place is on and the call offers real times", async () => {
  const alert = await shop({ bookingMode: "alert" });
  assert.equal(cap(await loadCapabilities(alert.id), "booking").state, "off");
  assert.equal(await ask(alert), OWNER_SETS_TIMES_REPLY);

  const s = await shop();
  await prisma.shopOperatingPolicy.create({ data: { businessId: s.id, travelMode: "duration_only" } });
  assert.equal(cap(await loadCapabilities(s.id), "booking").state, "ready");
  assert.equal(offersATime(await ask(s)), true);
});

test("automatic follow-ups wait on texting: the sweep pauses the shop and records nothing as sent", async () => {
  const s = await shop({ followUpMode: "auto", environment: "live" });
  const caps = await loadCapabilities(s.id);
  assert.equal(cap(caps, "sms").state, "pending");
  assert.equal(cap(caps, "follow_ups").state, "pending");
  assert.match(cap(caps, "follow_ups").meanwhile, /Nothing is sent in their place/);
  const p = phone();
  const customer = await prisma.customer.create({ data: { businessId: s.id, name: "Ann", phone: p, phoneNormalized: p } });
  const lead = await prisma.lead.create({
    data: { businessId: s.id, customerId: customer.id, name: "Ann", phone: p, status: "new", createdAt: new Date(Date.now() - 3 * 3_600_000) },
  });
  const at = new Date();
  at.setUTCHours(19, 0, 0, 0);
  const tally = await runAutoFollowUps({ now: at, budgetMs: 10_000 });
  assert.ok(tally.held >= 1);
  const after = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.equal(after.followUpSentAt, null);
  assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: { in: ["lead.follow_up_sent", "sms.held_sender_unverified"] } } }), 0);
});

test("payments: deposits asked for without a cleared Stripe account wait; cleared is on", async () => {
  const s = await shop({ depositEnabled: true, depositAmountCents: 5000 });
  assert.equal(cap(await loadCapabilities(s.id), "payments").state, "pending");
  await prisma.business.update({ where: { id: s.id }, data: { stripeConnectAccountId: `acct_${stamp()}`, stripeConnectChargesEnabled: false } });
  const waiting = cap(await loadCapabilities(s.id), "payments");
  assert.equal(waiting.state, "pending");
  assert.match(waiting.detail, /hasn't cleared/);
  await prisma.business.update({ where: { id: s.id }, data: { stripeConnectChargesEnabled: true } });
  assert.equal(cap(await loadCapabilities(s.id), "payments").state, "ready");
});

test("voice: a number with no go-live approval is not on; an approval on record is, and forwarding stays its own fact", async () => {
  const s = await shop({ vapiPhoneNumber: phone() });
  let voice = cap(await loadCapabilities(s.id), "voice");
  assert.equal(voice.state, "pending");
  assert.match(voice.detail, /No go-live approval/);
  const { activationTerms } = await import("../src/lib/activation-ack.ts");
  const terms = activationTerms(s);
  await prisma.activationAcknowledgement.create({
    data: {
      businessId: s.id,
      actorEmail: s.ownerEmail,
      noticeVersion: terms.noticeVersion,
      noticeText: terms.notice,
      setupVersion: terms.setupVersion,
      permissionsJson: JSON.stringify(terms.permissions),
      termsVersion: "t",
      acceptedRecording: true,
      approvedTurnOn: true,
      acceptedTerms: true,
      acceptedSms: true,
    },
  });
  voice = cap(await loadCapabilities(s.id), "voice");
  assert.equal(voice.state, "ready");
  assert.match(voice.detail, /Forwarding from your own number isn't proven/);
  assert.equal(voice.facts.find((f) => f.label.startsWith("Forwarding")).ok, false);
  assert.ok(voice.facts.find((f) => f.label.startsWith("Recording notice approved by")).ok);
});

test("test mode: texts are simulated, calls are not answered for real", async () => {
  const s = await shop({ environment: "test" });
  const caps = await loadCapabilities(s.id);
  assert.equal(cap(caps, "sms").state, "ready");
  assert.match(cap(caps, "sms").detail, /simulated/);
  assert.equal(cap(caps, "voice").state, "pending");
});
