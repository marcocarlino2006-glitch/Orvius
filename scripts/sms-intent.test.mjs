#!/usr/bin/env node
/*
 * The SMS intent ledger, against a mocked Twilio client and a disposable
 * database: one row per shop + event + recipient + version, a send that may
 * have left is never retried or re-routed, only pre-submit refusals retry, a
 * severe uncertain send raises exactly one owner exception, receipts dedupe,
 * and a resend is a new version linked to the one before.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.TWILIO_ACCOUNT_SID = "AC_test_only";
process.env.TWILIO_AUTH_TOKEN = "test-only";
process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_shared_test";
delete process.env.TWILIO_PHONE_NUMBER;

const calls = [];
let script = [];
mock.module(new URL("../src/lib/twilio-client.ts", import.meta.url).href, {
  namedExports: {
    getTwilioClient: () => ({
      messages: {
        create: async (p) => {
          calls.push(p);
          const next = script.shift() ?? { sid: `SM${calls.length}${Date.now()}` };
          if (next instanceof Error) throw next;
          return next;
        },
      },
    }),
  },
});

const { sendSms } = await import("../src/lib/twilio-sms.ts");
const { classifySendError, applyIntentReceipt, nextIntentVersion, claimIntent } = await import("../src/lib/sms-intent.ts");

const prisma = new PrismaClient();
/* These cases exercise the shared sender, so it is on record as verified (sms-eligibility.test covers the held case). */
await prisma.messagingSender.upsert({
  where: { identity: "service:MG_shared_test" },
  create: { identity: "service:MG_shared_test", kind: "messaging_service", status: "verified", checkedAt: new Date(), recordedBy: "test" },
  update: { status: "verified" },
});
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const phone = () => `+1312${7_000_000 + Math.floor(Math.random() * 2_000_000)}`;
const fail = (status, code, message = "twilio said no") => Object.assign(new Error(message), { status, code });

async function shop({ ownSender = false } = {}) {
  const business = await prisma.business.create({
    data: {
      name: "Intent Heating",
      slug: `intent-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "production",
      timezone: "America/Chicago",
      ownerPhone: phone(),
      ownerEmail: `owner-${stamp()}@example.test`,
    },
  });
  if (ownSender) {
    await prisma.shopTexting.create({ data: { businessId: business.id, status: "approved", messagingServiceSid: "MG_own_test", detailsJson: "{}" } });
  }
  return business;
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const reset = (next = []) => {
  calls.length = 0;
  script = next;
};
const send = (business, to, intent) => sendSms({ to, body: "Your tech is on the way", businessId: business.id, audience: "customer", intent });
const intents = (businessId) => prisma.smsIntent.findMany({ where: { businessId }, orderBy: { messageVersion: "asc" } });
const exceptions = (businessId) => prisma.auditEvent.findMany({ where: { businessId, action: "sms.delivery_exception" } });

test("errors are classified by what they say about submission", () => {
  assert.equal(classifySendError(fail(400, 21610)), "recipient_refused");
  assert.equal(classifySendError(fail(400, "21211")), "recipient_refused");
  assert.equal(classifySendError(fail(429, 20429)), "retryable");
  assert.equal(classifySendError(fail(400, 21606)), "rejected");
  assert.equal(classifySendError(fail(503, 20500)), "unknown_submission");
  assert.equal(classifySendError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })), "unknown_submission");
  assert.equal(classifySendError(new Error("ETIMEDOUT")), "unknown_submission");
});

test("the same event to the same person is one provider call; the second caller gets the first sid back", async () => {
  const business = await shop();
  try {
    reset([{ sid: "SM_once" }]);
    const to = phone();
    const intent = { eventType: "job.on_the_way", eventId: "job1@t1" };
    assert.deepEqual(await send(business, to, intent), { sid: "SM_once" });
    assert.deepEqual(await send(business, to, intent), { sid: "SM_once" });
    assert.equal(calls.length, 1);
    const [row] = await intents(business.id);
    assert.equal(row.status, "submitted");
    assert.equal(row.providerSid, "SM_once");
    assert.equal(row.attempts, 1);
    assert.equal(row.recipientNormalized, to);
  } finally {
    await drop(business.id);
  }
});

test("a timeout after possible acceptance is unknown: no retry, no shared sender, one exception for a severe text", async () => {
  const business = await shop({ ownSender: true });
  try {
    reset([fail(undefined, "ETIMEDOUT", "timed out")]);
    const to = phone();
    const intent = { eventType: "job.on_the_way", eventId: "job2@t1", severity: "severe" };
    await assert.rejects(send(business, to, intent), /timed out/);
    assert.equal(calls.length, 1, "never retried");
    assert.equal(calls[0].messagingServiceSid, "MG_own_test", "never re-routed through the shared sender");
    const [row] = await intents(business.id);
    assert.equal(row.status, "unknown_submission");
    assert.ok(row.exceptionRaisedAt);
    assert.equal((await exceptions(business.id)).length, 1);

    assert.equal(await send(business, to, intent), null, "a later caller does not resend an unknown submission");
    assert.equal(calls.length, 1);
    assert.equal((await exceptions(business.id)).length, 1, "still one exception");
  } finally {
    await drop(business.id);
  }
});

test("a routine unknown submission closes without an owner exception", async () => {
  const business = await shop();
  try {
    reset([fail(502, null, "bad gateway")]);
    await assert.rejects(send(business, phone(), { eventType: "plan.joined", eventId: "m1" }));
    const [row] = await intents(business.id);
    assert.equal(row.status, "unknown_submission");
    assert.equal(row.exceptionRaisedAt, null);
    assert.equal((await exceptions(business.id)).length, 0);
  } finally {
    await drop(business.id);
  }
});

test("a rate refusal retries a bounded number of times, then stops as retry_exhausted", async () => {
  const business = await shop();
  try {
    reset([fail(429, 20429), { sid: "SM_after_retry" }]);
    assert.deepEqual(await send(business, phone(), { eventType: "job.on_the_way", eventId: "job3@t1" }), { sid: "SM_after_retry" });
    assert.equal(calls.length, 2);

    reset([fail(429, 20429), fail(429, 20429), fail(429, 20429), { sid: "SM_never" }]);
    await assert.rejects(send(business, phone(), { eventType: "job.on_the_way", eventId: "job4@t1", severity: "severe" }));
    assert.equal(calls.length, 3);
    const row = await prisma.smsIntent.findFirstOrThrow({ where: { businessId: business.id, eventId: "job4@t1" } });
    assert.equal(row.status, "retry_exhausted");
    assert.equal(JSON.parse(row.attemptsJson).length, 3);
    assert.ok(row.exceptionRaisedAt);
  } finally {
    await drop(business.id);
  }
});

test("a definite refusal from the shop's own sender tries the shared sender once; a recipient refusal never does", async () => {
  const business = await shop({ ownSender: true });
  try {
    reset([fail(400, 21606, "not a valid sender"), { sid: "SM_shared" }]);
    assert.deepEqual(await send(business, phone(), { eventType: "job.on_the_way", eventId: "job5@t1" }), { sid: "SM_shared" });
    assert.deepEqual(calls.map((c) => c.messagingServiceSid), ["MG_own_test", "MG_shared_test"]);

    reset([fail(400, 21610, "unsubscribed")]);
    const to = phone();
    await assert.rejects(send(business, to, { eventType: "job.on_the_way", eventId: "job6@t1" }), /unsubscribed/);
    assert.equal(calls.length, 1);
    const row = await prisma.smsIntent.findFirstOrThrow({ where: { businessId: business.id, eventId: "job6@t1" } });
    assert.equal(row.status, "rejected");
  } finally {
    await drop(business.id);
  }
});

test("receipts append once per status; undelivered on a severe text raises one exception", async () => {
  const business = await shop();
  try {
    reset([{ sid: "SM_receipt" }]);
    await send(business, phone(), { eventType: "job.tech_assigned", eventId: "job7:tech@t1", severity: "severe" });
    assert.deepEqual(await applyIntentReceipt({ messageSid: "SM_receipt", messageStatus: "sent" }), { matched: true, exception: false });
    await applyIntentReceipt({ messageSid: "SM_receipt", messageStatus: "sent" });
    assert.deepEqual(await applyIntentReceipt({ messageSid: "SM_receipt", messageStatus: "undelivered", errorCode: "30003" }), { matched: true, exception: true });
    assert.deepEqual(await applyIntentReceipt({ messageSid: "SM_receipt", messageStatus: "undelivered", errorCode: "30003" }), { matched: true, exception: false });
    const [row] = await intents(business.id);
    assert.equal(row.status, "undelivered");
    assert.deepEqual(JSON.parse(row.receiptsJson).map((r) => r.status), ["sent", "undelivered"]);
    assert.equal((await exceptions(business.id)).length, 1);
    assert.deepEqual(await applyIntentReceipt({ messageSid: "SM_unknown", messageStatus: "delivered" }), { matched: false, exception: false });
  } finally {
    await drop(business.id);
  }
});

test("a resend is a new authorized version linked to the one before", async () => {
  const business = await shop();
  try {
    reset([{ sid: "SM_v1" }, { sid: "SM_v2" }]);
    const to = phone();
    const base = { eventType: "invoice.pay_link", eventId: "inv1" };
    await send(business, to, { ...base, ...(await nextIntentVersion({ businessId: business.id, ...base, to })) });
    const v2 = await nextIntentVersion({ businessId: business.id, ...base, to });
    assert.equal(v2.version, 2);
    await send(business, to, { ...base, ...v2, authorizedBy: "owner:invoice_send" });
    assert.equal(calls.length, 2);
    const [first, second] = await intents(business.id);
    assert.equal(second.messageVersion, 2);
    assert.equal(second.priorIntentId, first.id);
    assert.equal(second.authorizedBy, "owner:invoice_send");
  } finally {
    await drop(business.id);
  }
});

test("a lease that expired mid-send is unknown, not a fresh send", async () => {
  const business = await shop();
  try {
    const to = phone();
    const intent = { eventType: "job.on_the_way", eventId: "job8@t1" };
    const first = await claimIntent({ businessId: business.id, to, audience: "customer", intent, now: new Date(Date.now() - 5 * 60_000) });
    assert.equal(first.kind, "claimed");
    const later = await claimIntent({ businessId: business.id, to, audience: "customer", intent });
    assert.equal(later.kind, "closed");
    assert.equal(later.intent.status, "unknown_submission");
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
