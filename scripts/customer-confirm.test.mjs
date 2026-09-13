import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIRM_REMINDER_AFTER_HOURS,
  CONFIRM_REMINDER_MIN_LEAD_HOURS,
  shouldSendConfirmationReminder,
} from "../src/lib/customer-confirm.ts";

const NOW = new Date("2026-09-08T12:00:00.000Z");

function proposed(overrides = {}) {
  return {
    status: "scheduled",
    scheduledAt: new Date("2026-09-09T12:00:00.000Z"),
    customerConfirmedAt: null,
    customerConfirmSentAt: new Date("2026-09-07T12:00:00.000Z"),
    customerConfirmReminderSentAt: null,
    ...overrides,
  };
}

test("one unconfirmed proposal becomes due after the wait", () => {
  assert.equal(CONFIRM_REMINDER_AFTER_HOURS, 12);
  assert.equal(CONFIRM_REMINDER_MIN_LEAD_HOURS, 2);
  assert.equal(shouldSendConfirmationReminder(proposed(), NOW), true);
});

test("never reminds before the first SMS was really sent", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({ customerConfirmSentAt: null }),
      NOW,
    ),
    false,
  );
});

test("never reminds a confirmed, completed, or cancelled job", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({ customerConfirmedAt: new Date() }),
      NOW,
    ),
    false,
  );
  assert.equal(
    shouldSendConfirmationReminder(proposed({ status: "completed" }), NOW),
    false,
  );
  assert.equal(
    shouldSendConfirmationReminder(proposed({ status: "cancelled" }), NOW),
    false,
  );
});

test("one reminder is the hard ceiling", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({ customerConfirmReminderSentAt: new Date() }),
      NOW,
    ),
    false,
    "a second automated retry would be a drip campaign, not operations",
  );
});

test("does not nag inside twelve hours", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({
        customerConfirmSentAt: new Date(
          NOW.getTime() - (CONFIRM_REMINDER_AFTER_HOURS * 60 - 1) * 60_000,
        ),
      }),
      NOW,
    ),
    false,
  );
});

test("does not send when the appointment is too close", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({
        scheduledAt: new Date(
          NOW.getTime() +
            (CONFIRM_REMINDER_MIN_LEAD_HOURS * 60 - 1) * 60_000,
        ),
      }),
      NOW,
    ),
    false,
  );
});

test("the boundary is inclusive and deterministic", () => {
  assert.equal(
    shouldSendConfirmationReminder(
      proposed({
        customerConfirmSentAt: new Date(
          NOW.getTime() - CONFIRM_REMINDER_AFTER_HOURS * 60 * 60_000,
        ),
        scheduledAt: new Date(
          NOW.getTime() + CONFIRM_REMINDER_MIN_LEAD_HOURS * 60 * 60_000,
        ),
      }),
      NOW,
    ),
    true,
  );
});
