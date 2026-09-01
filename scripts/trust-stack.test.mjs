import test from "node:test";
import assert from "node:assert/strict";

const NOTIFICATION_RETRY_MINUTES = [1, 5, 15, 60, 240];

function getNotificationRetryAt(attempts, now = Date.now()) {
  const minutes = NOTIFICATION_RETRY_MINUTES[
    Math.min(attempts, NOTIFICATION_RETRY_MINUTES.length - 1)
  ];
  return new Date(now + minutes * 60_000);
}

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

test("notification retry backoff escalates to 4 hours", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  assert.deepEqual(NOTIFICATION_RETRY_MINUTES, [1, 5, 15, 60, 240]);

  assert.equal(
    getNotificationRetryAt(0, base).toISOString(),
    "2026-01-01T00:01:00.000Z",
  );
  assert.equal(
    getNotificationRetryAt(4, base).toISOString(),
    "2026-01-01T04:00:00.000Z",
  );
  assert.equal(
    getNotificationRetryAt(99, base).toISOString(),
    "2026-01-01T04:00:00.000Z",
  );
});
