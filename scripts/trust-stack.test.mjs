import test from "node:test";
import assert from "node:assert/strict";

/*
  Imported, not copied. The copy that used to live here escalated correctly on
  its own terms and told us nothing: it was called with 0, which the shipped
  caller never does, so it certified a one-minute first retry that the queue
  could not perform. A test that re-implements its subject cannot see the
  subject's callers, which is the only place that kind of fault lives.
*/
import {
  MAX_ATTEMPTS,
  NOTIFICATION_RETRY_MINUTES,
  getNotificationRetryAt,
} from "../src/lib/notification-queue.ts";

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

function phonesEqual(a, b) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  return left === right;
}

function ownerPhoneConflictsWithShopLine({ ownerPhone, shopLines }) {
  if (!ownerPhone?.trim()) return false;
  return shopLines.some((line) => phonesEqual(ownerPhone, line));
}

function buildLeadAlertDedupeKey(source) {
  if (source.vapiCallId) return `call:${source.vapiCallId}`;
  if (source.messageSid) return `sms:${source.messageSid}`;
  if (source.leadId) return `lead:${source.leadId}`;
  return `alert:${Date.now()}`;
}

test("phonesEqual normalizes US numbers", () => {
  assert.equal(phonesEqual("+1 555 123 4567", "5551234567"), true);
  assert.equal(phonesEqual("+15551234567", "(555) 123-4567"), true);
  assert.equal(phonesEqual("+15551234567", "+15559876543"), false);
});

test("owner phone cannot match shop line", () => {
  assert.equal(
    ownerPhoneConflictsWithShopLine({
      ownerPhone: "+1 844 643 9170",
      shopLines: ["+18446439170"],
    }),
    true,
  );
});

test("dedupe keys are stable per inbound event", () => {
  assert.equal(buildLeadAlertDedupeKey({ vapiCallId: "call_123" }), "call:call_123");
  assert.equal(buildLeadAlertDedupeKey({ messageSid: "SM123" }), "sms:SM123");
});

test("notification retry backoff walks every rung to 4 hours", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  assert.deepEqual(NOTIFICATION_RETRY_MINUTES, [1, 5, 15, 60, 240]);

  /* One more attempt than there are gaps between attempts. */
  assert.equal(MAX_ATTEMPTS, NOTIFICATION_RETRY_MINUTES.length + 1);

  const waitAfter = (attempts) =>
    (getNotificationRetryAt(attempts, base).getTime() - base) / 60_000;

  assert.deepEqual(
    NOTIFICATION_RETRY_MINUTES.map((_, i) => waitAfter(i + 1)),
    NOTIFICATION_RETRY_MINUTES,
    "every published rung is one the queue can actually reach",
  );
  assert.equal(waitAfter(99), 240, "the last rung is the ceiling");
});
