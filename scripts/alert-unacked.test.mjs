import assert from "node:assert/strict";
import test from "node:test";

import {
  isOwnerAlertUnacked,
  ownerAlertUnackedWaitMs,
} from "../src/lib/owner-alert-unacked.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("unacked wait is tighter after hours", () => {
  assert.equal(ownerAlertUnackedWaitMs(true), 30 * 60_000);
  assert.equal(ownerAlertUnackedWaitMs(false), 120 * 60_000);
});

test("delivered alert with no owner contact becomes unacked after the wait", () => {
  const now = new Date("2026-09-17T08:00:00.000Z");
  assert.equal(
    isOwnerAlertUnacked({
      alertedAt: new Date("2026-09-17T07:20:00.000Z"),
      firstContactedAt: null,
      now,
      afterHours: true,
    }),
    true,
  );
  assert.equal(
    isOwnerAlertUnacked({
      alertedAt: new Date("2026-09-17T07:45:00.000Z"),
      firstContactedAt: null,
      now,
      afterHours: true,
    }),
    false,
  );
  assert.equal(
    isOwnerAlertUnacked({
      alertedAt: new Date("2026-09-17T07:00:00.000Z"),
      firstContactedAt: new Date("2026-09-17T07:10:00.000Z"),
      now,
      afterHours: true,
    }),
    false,
  );
});

test("alert_unacked is a board kind with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("alert_unacked"));
  assert.equal(attentionKindLabel("alert_unacked"), "Unacked");
  assert.equal(attentionActionStrategy("alert_unacked"), "call");
});
