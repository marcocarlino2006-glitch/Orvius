import assert from "node:assert/strict";
import test from "node:test";

import {
  ARRIVAL_REMINDER_MIN_LEAD_MINUTES,
  ARRIVAL_REMINDER_WITHIN_HOURS,
  shouldSendArrivalReminder,
} from "../src/lib/arrival-reminder.ts";
import { isValidPublicReviewUrl } from "../src/lib/job-review-sms.ts";

const NOW = new Date("2026-09-23T12:00:00.000Z");

test("arrival reminder only for confirmed windows inside the 2h lead", () => {
  assert.equal(ARRIVAL_REMINDER_WITHIN_HOURS, 2);
  assert.equal(ARRIVAL_REMINDER_MIN_LEAD_MINUTES, 15);

  assert.equal(
    shouldSendArrivalReminder(
      {
        status: "confirmed",
        scheduledAt: new Date(NOW.getTime() + 60 * 60_000),
        customerConfirmedAt: new Date(NOW.getTime() - 60_000),
        arrivalReminderSentAt: null,
      },
      NOW,
    ),
    true,
  );

  assert.equal(
    shouldSendArrivalReminder(
      {
        status: "confirmed",
        scheduledAt: new Date(NOW.getTime() + 3 * 60 * 60_000),
        customerConfirmedAt: new Date(),
        arrivalReminderSentAt: null,
      },
      NOW,
    ),
    false,
    "too far out",
  );

  assert.equal(
    shouldSendArrivalReminder(
      {
        status: "scheduled",
        scheduledAt: new Date(NOW.getTime() + 60 * 60_000),
        customerConfirmedAt: null,
        arrivalReminderSentAt: null,
      },
      NOW,
    ),
    false,
    "unconfirmed is confirm-SMS territory, not arrival",
  );

  assert.equal(
    shouldSendArrivalReminder(
      {
        status: "confirmed",
        scheduledAt: new Date(NOW.getTime() + 60 * 60_000),
        customerConfirmedAt: new Date(),
        arrivalReminderSentAt: new Date(),
      },
      NOW,
    ),
    false,
    "one reminder ceiling",
  );
});

test("review URL rejects placeholders and non-http", () => {
  assert.equal(isValidPublicReviewUrl("https://g.page/r/abc"), true);
  assert.equal(isValidPublicReviewUrl("http://maps.google.com/?cid=1"), true);
  assert.equal(isValidPublicReviewUrl("https://example.com/review"), false);
  assert.equal(isValidPublicReviewUrl("not-a-url"), false);
  assert.equal(isValidPublicReviewUrl(""), false);
  assert.equal(isValidPublicReviewUrl(null), false);
});
