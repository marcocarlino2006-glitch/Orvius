import test from "node:test";
import assert from "node:assert/strict";

/*
  Imported, not copied. Every function below used to be re-implemented in this
  file, and the copies agreed with themselves. The retry ladder is what that
  cost: the copy was called with 0 and certified a one-minute first retry that
  the shipped caller could never ask for, so a rung stayed published for as
  long as the test kept passing. A test that re-implements its subject cannot
  see the subject's callers, which is the only place that kind of fault lives.
*/
import { normalizePhone } from "../src/lib/customer.ts";
import {
  ownerPhoneConflictsWithShopLine,
  phonesEqual,
  validateOwnerPhoneForAlerts,
} from "../src/lib/owner-alerts.ts";
import { buildLeadAlertDedupeKey } from "../src/lib/notifications.ts";
import {
  MAX_ATTEMPTS,
  NOTIFICATION_RETRY_MINUTES,
  getNotificationRetryAt,
} from "../src/lib/notification-queue.ts";

test("phonesEqual normalizes US numbers", () => {
  assert.equal(phonesEqual("+1 555 123 4567", "5551234567"), true);
  assert.equal(phonesEqual("+15551234567", "(555) 123-4567"), true);
  assert.equal(phonesEqual("+15551234567", "+15559876543"), false);
  assert.equal(phonesEqual(null, "+15551234567"), false);
  assert.equal(phonesEqual("", ""), false, "two unknowns are not a match");
});

test("normalizePhone keeps enough to dedupe a caller", () => {
  assert.equal(normalizePhone("(555) 123-4567"), "+15551234567");
  assert.equal(normalizePhone("15551234567"), "+15551234567");
  assert.equal(normalizePhone("555-1234"), "5551234", "short numbers survive");
  assert.equal(normalizePhone("911"), null, "too short to identify anyone");
  assert.equal(normalizePhone(null), null);
});

test("owner phone cannot match shop line", () => {
  assert.equal(
    ownerPhoneConflictsWithShopLine({
      ownerPhone: "+1 844 643 9170",
      shopLines: ["+18446439170"],
    }),
    true,
  );
  assert.equal(
    ownerPhoneConflictsWithShopLine({
      ownerPhone: "+18445551212",
      shopLines: ["+18446439170", null],
    }),
    false,
  );
});

test("the alert-phone check explains itself to the owner", () => {
  /* The mirrored copy stopped at the boolean, so the sentence a shop owner
     actually reads was never covered by anything. */
  assert.deepEqual(
    validateOwnerPhoneForAlerts({
      ownerPhone: "+18445551212",
      shopLines: ["+18446439170"],
    }),
    { ok: true },
  );

  const sameNumber = validateOwnerPhoneForAlerts({
    ownerPhone: "+18446439170",
    shopLines: ["+1 844 643 9170"],
  });
  assert.equal(sameNumber.ok, false);
  assert.match(sameNumber.reason, /same as your shop line/);

  assert.equal(validateOwnerPhoneForAlerts({ ownerPhone: "", shopLines: [] }).ok, false);
  assert.equal(validateOwnerPhoneForAlerts({ ownerPhone: "5551234", shopLines: [] }).ok, false);
});

test("dedupe keys are stable per inbound event", () => {
  assert.equal(buildLeadAlertDedupeKey({ vapiCallId: "call_123" }), "call:call_123");
  assert.equal(buildLeadAlertDedupeKey({ messageSid: "SM123" }), "sms:SM123");
  assert.equal(buildLeadAlertDedupeKey({ leadId: "lead_9" }), "lead:lead_9");
  assert.equal(
    buildLeadAlertDedupeKey({ vapiCallId: "call_123", messageSid: "SM123" }),
    "call:call_123",
    "the call wins, so one call cannot alert twice through two doors",
  );
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
