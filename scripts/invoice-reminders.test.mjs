#!/usr/bin/env node
/*
 * Invoice reminders: a sent, unpaid bill gets at most two polite texts, in the
 * shop's day, only for shops on automatic follow-ups that take cards, never for
 * a bill that is paid, voided, or whose last text failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const {
  FIRST_REMINDER_AFTER_MS,
  MAX_REMINDERS,
  REMINDERS_STOP_AFTER_MS,
  SECOND_REMINDER_AFTER_MS,
  reminderBlock,
  reminderMessage,
  runInvoiceReminders,
  sendInvoiceReminder,
} = await import("../src/lib/invoice-reminders.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
/* 2pm in Chicago. */
const AFTERNOON = new Date("2026-09-29T19:00:00Z");
const daysBefore = (d, from = AFTERNOON) => new Date(from.getTime() - d * 86_400_000);
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

function fakeSms(clock = { now: AFTERNOON }) {
  const sent = [];
  return {
    clock,
    sent,
    send: async (params) => {
      sent.push(params);
      await prisma.smsIntent.create({
        data: {
          businessId: params.businessId,
          eventType: params.intent.eventType,
          eventId: params.intent.eventId,
          recipientNormalized: params.to,
          messageVersion: params.intent.version,
          priorIntentId: params.intent.priorIntentId,
          authorizedBy: params.intent.authorizedBy,
          audience: "customer",
          status: "delivered",
          createdAt: clock.now,
        },
      });
      return { sent: true, sid: `SM${sent.length}` };
    },
  };
}

async function shop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Cool Air Co",
      slug: `ir-${stamp()}`,
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      environment: "live",
      followUpMode: "auto",
      stripeConnectAccountId: `acct_${stamp()}`,
      stripeConnectChargesEnabled: true,
      ...overrides,
    },
  });
}

async function bill(business, { sentDaysAgo = 4, amountCents = 48_600, phone = randomPhone(), ...data } = {}) {
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ann Cole", phone, phoneNormalized: phone },
  });
  const job = await prisma.job.create({
    data: { businessId: business.id, customerId: customer.id, title: "AC repair", status: "completed", completedAt: daysBefore(sentDaysAgo + 1) },
  });
  return prisma.invoice.create({
    data: {
      businessId: business.id,
      jobId: job.id,
      amountCents,
      status: "open",
      publicToken: `tok-${stamp()}`,
      sentAt: daysBefore(sentDaysAgo),
      ...data,
    },
  });
}

test("the text names the balance, links to pay, and offers a way out", () => {
  const body = reminderMessage({ businessName: "Cool Air Co", balanceCents: 48_600, payUrl: "https://orvius.im/i/tok" });
  assert.match(body, /^Cool Air Co: a friendly reminder that your balance of \$486\.00 is still open\./);
  assert.match(body, /https:\/\/orvius\.im\/i\/tok/);
  assert.match(body, /STOP/);
});

test("when a reminder is due", () => {
  const base = { sentAt: daysBefore(4), remindersSent: 0, lastReminderAt: null, lastTextStatus: "delivered" };
  assert.equal(reminderBlock(base, AFTERNOON), null);
  assert.equal(reminderBlock({ ...base, sentAt: daysBefore(2) }, AFTERNOON), "too_soon");
  assert.equal(reminderBlock({ ...base, sentAt: null }, AFTERNOON), "not_sent");
  assert.equal(reminderBlock({ ...base, sentAt: new Date(AFTERNOON.getTime() - REMINDERS_STOP_AFTER_MS - 1000) }, AFTERNOON), "too_old");
  assert.equal(reminderBlock({ ...base, lastTextStatus: "undelivered" }, AFTERNOON), "last_text_failed");
  assert.equal(reminderBlock({ ...base, lastTextStatus: "rejected" }, AFTERNOON), "last_text_failed");
  const second = { sentAt: daysBefore(12), remindersSent: 1, lastReminderAt: daysBefore(5), lastTextStatus: "delivered" };
  assert.equal(reminderBlock(second, AFTERNOON), "too_soon");
  assert.equal(reminderBlock({ ...second, lastReminderAt: daysBefore(8) }, AFTERNOON), null);
  assert.equal(reminderBlock({ ...second, remindersSent: MAX_REMINDERS, lastReminderAt: daysBefore(30) }, AFTERNOON), "limit_reached");
  assert.equal(FIRST_REMINDER_AFTER_MS, 3 * 86_400_000);
  assert.equal(SECOND_REMINDER_AFTER_MS, 7 * 86_400_000);
});

test("a resend by the owner restarts the wait", () => {
  const state = { sentAt: daysBefore(1), remindersSent: 1, lastReminderAt: daysBefore(9), lastTextStatus: "delivered" };
  assert.equal(reminderBlock(state, AFTERNOON), "too_soon");
});

test("an unpaid bill gets a reminder, then one more a week later, then no more", async () => {
  const business = await shop();
  try {
    const invoice = await bill(business, { sentDaysAgo: 4 });
    const sms = fakeSms();

    assert.deepEqual(await sendInvoiceReminder({ invoiceId: invoice.id, now: AFTERNOON, send: sms.send }), { sent: true });
    assert.equal(sms.sent.length, 1);
    assert.match(sms.sent[0].body, /\$486\.00/);
    assert.equal(sms.sent[0].intent.authorizedBy, "auto:invoice_reminder");

    assert.deepEqual(await sendInvoiceReminder({ invoiceId: invoice.id, now: AFTERNOON, send: sms.send }), { sent: false, reason: "too_soon" });

    const nextWeek = new Date(AFTERNOON.getTime() + 7 * 86_400_000 + 1000);
    sms.clock.now = nextWeek;
    assert.deepEqual(await sendInvoiceReminder({ invoiceId: invoice.id, now: nextWeek, send: sms.send }), { sent: true });
    assert.equal(sms.sent[1].intent.version, 2);

    const muchLater = new Date(AFTERNOON.getTime() + 20 * 86_400_000);
    assert.deepEqual(await sendInvoiceReminder({ invoiceId: invoice.id, now: muchLater, send: sms.send }), { sent: false, reason: "limit_reached" });
    assert.equal(sms.sent.length, 2);
  } finally {
    await drop(business.id);
  }
});

test("a paid, voided, part-paid-in-full, or phoneless bill is never reminded", async () => {
  const business = await shop();
  try {
    const sms = fakeSms();
    const paid = await bill(business, { status: "paid", paidAt: daysBefore(1) });
    const voided = await bill(business, { status: "void" });
    const covered = await bill(business, { amountCents: 10_000 });
    await prisma.payment.create({ data: { businessId: business.id, invoiceId: covered.id, amountCents: 10_000, status: "succeeded" } });
    const noPhone = await bill(business, { phone: "" });
    const expected = new Map([
      [paid.id, "not_open"],
      [voided.id, "not_open"],
      [covered.id, "no_balance"],
      [noPhone.id, "no_phone"],
    ]);
    for (const [id, reason] of expected) {
      assert.deepEqual(await sendInvoiceReminder({ invoiceId: id, now: AFTERNOON, send: sms.send }), { sent: false, reason }, reason);
    }
    assert.equal(sms.sent.length, 0);
  } finally {
    await drop(business.id);
  }
});

test("the sweep reminds only shops on automatic follow-ups that take cards, in the shop's day", async () => {
  const auto = await shop();
  const ask = await shop({ followUpMode: "ask" });
  const noCards = await shop({ stripeConnectChargesEnabled: false });
  const test_ = await shop({ environment: "test" });
  try {
    const wanted = await bill(auto, { sentDaysAgo: 5 });
    for (const other of [ask, noCards, test_]) await bill(other, { sentDaysAgo: 5 });
    const sms = fakeSms();

    const night = new Date("2026-09-30T04:00:00Z");
    await runInvoiceReminders({ now: night, send: sms.send });
    assert.equal(sms.sent.filter((s) => s.businessId === auto.id).length, 0, "11pm in Chicago is not the shop's day");

    await runInvoiceReminders({ now: AFTERNOON, send: sms.send });
    const mine = sms.sent.filter((s) => [auto, ask, noCards, test_].some((b) => b.id === s.businessId));
    assert.deepEqual([...new Set(mine.map((s) => s.businessId))], [auto.id]);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].intent.eventId, wanted.id);

    await runInvoiceReminders({ now: AFTERNOON, send: sms.send });
    assert.equal(sms.sent.filter((s) => s.businessId === auto.id).length, 1, "a second run the same day sends nothing more");
  } finally {
    for (const b of [auto, ask, noCards, test_]) await drop(b.id);
  }
});

test("a customer who texted STOP gets no reminder", async () => {
  const business = await shop();
  try {
    const invoice = await bill(business, { sentDaysAgo: 4 });
    const customer = await prisma.customer.findFirst({ where: { businessId: business.id } });
    await prisma.smsOptOut.create({ data: { businessId: business.id, phone: customer.phone, phoneNormalized: customer.phoneNormalized } });
    const { sendCustomerSms } = await import("../src/lib/customer-sms.ts");
    const result = await sendInvoiceReminder({ invoiceId: invoice.id, now: AFTERNOON, send: sendCustomerSms });
    assert.deepEqual(result, { sent: false, reason: "customer_opted_out" });
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
