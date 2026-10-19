#!/usr/bin/env node
/*
 * Carrier receipts arrive out of order. Disposable database, no providers:
 * once a text is confirmed delivered, a stale "failed" receipt for it never
 * reopens the owner alert (and so never resends it), never flips the intent
 * ledger back to undelivered, and never tells the owner a customer
 * confirmation failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) delete process.env[key];

const { applySmsDeliveryReceipt } = await import("../src/lib/notification-queue.ts");
const { applyIntentReceipt, smsAlreadyDelivered } = await import("../src/lib/sms-intent.ts");
const { applyCustomerConfirmReceipt } = await import("../src/lib/customer-confirm.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

async function shop() {
  const row = await prisma.business.create({
    data: { name: "Receipts HVAC", slug: `receipts-${uid()}`, environment: "test", ownerPhone: "+15555550199", ownerEmail: `owner-${uid()}@example.test` },
  });
  made.push(row.id);
  return row;
}

test("an owner alert confirmed delivered is not reopened or resent by a late failure receipt", async () => {
  const business = await shop();
  const sid = `SM${uid()}`;
  const row = await prisma.ownerNotification.create({
    data: {
      businessId: business.id,
      businessName: business.name,
      channel: "sms",
      dedupeKey: `late-fail:${business.id}`,
      message: "No heat",
      ownerPhone: business.ownerPhone,
      status: "sent",
      attempts: 1,
      deliveryId: sid,
      deliveryStatus: "sent",
      processedAt: new Date(),
    },
  });
  assert.equal((await applySmsDeliveryReceipt({ messageSid: sid, messageStatus: "delivered" })).delivered, 1);
  assert.equal((await prisma.ownerNotification.findUnique({ where: { id: row.id } })).deliveryStatus, "delivered");

  const late = await applySmsDeliveryReceipt({ messageSid: sid, messageStatus: "undelivered", errorCode: "30003" });
  assert.equal(late.reopened, 0);
  const after = await prisma.ownerNotification.findUnique({ where: { id: row.id } });
  assert.equal(after.status, "sent", "not put back on the ladder");
  assert.equal(after.attempts, 1, "no second send");
  assert.equal(after.deliveryStatus, "delivered");

  const route = readFileSync("src/app/api/webhooks/twilio/status/route.ts", "utf8");
  assert.match(route, /OR: \[\{ deliveryStatus: null \}, \{ deliveryStatus: \{ not: "delivered" \} \}\]/, "the webhook's own bookkeeping doesn't overwrite delivered either");
});

test("the intent ledger keeps delivered through a late failure and raises no exception", async () => {
  const business = await shop();
  const sid = `SM${uid()}`;
  const intent = await prisma.smsIntent.create({
    data: { businessId: business.id, eventType: "safety.alert", eventId: uid(), recipientNormalized: "+15555550100", audience: "owner", severity: "severe", status: "submitted", providerSid: sid },
  });
  await applyIntentReceipt({ messageSid: sid, messageStatus: "delivered" });
  const late = await applyIntentReceipt({ messageSid: sid, messageStatus: "failed", errorCode: "30005" });
  assert.equal(late.exception, false);
  const row = await prisma.smsIntent.findUnique({ where: { id: intent.id } });
  assert.equal(row.status, "delivered");
  assert.equal(row.exceptionRaisedAt, null);
  assert.deepEqual(JSON.parse(row.receiptsJson).map((r) => r.status), ["delivered", "failed"], "the late receipt is kept as evidence");
  assert.equal(await smsAlreadyDelivered(sid), true);
});

test("a delivered and a failed receipt racing leave the intent delivered", async () => {
  const business = await shop();
  const sid = `SM${uid()}`;
  const intent = await prisma.smsIntent.create({
    data: { businessId: business.id, eventType: "job.confirm", eventId: uid(), recipientNormalized: "+15555550101", audience: "customer", status: "submitted", providerSid: sid },
  });
  await Promise.all([applyIntentReceipt({ messageSid: sid, messageStatus: "failed" }), applyIntentReceipt({ messageSid: sid, messageStatus: "delivered" })]);
  const row = await prisma.smsIntent.findUnique({ where: { id: intent.id } });
  assert.equal(JSON.parse(row.receiptsJson).length, 2, "neither receipt is lost");
  assert.equal(row.status, "delivered", "whichever lands first, delivered wins");
});

test("a late failure on a delivered customer confirmation doesn't tell the owner it failed", async () => {
  const business = await shop();
  const sid = `SM${uid()}`;
  const job = await prisma.job.create({ data: { businessId: business.id, title: "Tune-up", status: "scheduled", customerConfirmSid: sid, customerConfirmSentAt: new Date() } });
  await prisma.smsIntent.create({
    data: { businessId: business.id, eventType: "job.confirm", eventId: job.id, recipientNormalized: "+15555550102", audience: "customer", status: "delivered", providerSid: sid },
  });
  const out = await applyCustomerConfirmReceipt({ messageSid: sid, messageStatus: "undelivered", errorCode: "30003" });
  assert.equal(out.alerted, false);
  assert.equal(await prisma.ownerNotification.count({ where: { businessId: business.id } }), 0);

  const fresh = `SM${uid()}`;
  await prisma.job.update({ where: { id: job.id }, data: { customerConfirmSid: fresh } });
  const real = await applyCustomerConfirmReceipt({ messageSid: fresh, messageStatus: "undelivered", errorCode: "30003" });
  assert.equal(real.matched, true, "a failure with no delivery on record still reaches the owner path");
});

test("an email the mail service accepted is recorded as accepted, never delivered, and the test alert says sent", async () => {
  const queue = readFileSync("src/lib/notification-queue.ts", "utf8");
  const emailBranch = queue.slice(queue.indexOf('if (row.channel === "email")'), queue.indexOf('logInfo("notification.email_sent"'));
  assert.match(emailBranch, /deliveryStatus: "accepted"/);
  assert.doesNotMatch(emailBranch, /deliveryStatus: "(delivered|sent)"/);
  const { describeTestAlert } = await import("../src/lib/test-alert-message.ts");
  assert.doesNotMatch(describeTestAlert({ email: { status: "sent" } }, { phone: null, email: "o@example.test" }).message, /deliver/i);
});
