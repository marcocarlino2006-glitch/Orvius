import assert from "node:assert/strict";
import test from "node:test";

import {
  depositFailWaitMs,
  depositNeedsOwnerFollowUp,
} from "../src/lib/deposit-fail.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("failed status always needs owner follow-up", () => {
  assert.equal(
    depositNeedsOwnerFollowUp({ status: "failed", sentAt: new Date() }),
    true,
  );
  assert.equal(
    depositNeedsOwnerFollowUp({ status: "paid", sentAt: new Date() }),
    false,
  );
});

test("stale pending deposit escalates; fresh pending does not", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(depositFailWaitMs(true), 60 * 60_000);
  assert.equal(depositFailWaitMs(false), 4 * 60 * 60_000);

  assert.equal(
    depositNeedsOwnerFollowUp({
      status: "pending",
      sentAt: new Date("2026-09-17T10:30:00.000Z"),
      now,
      afterHours: true,
    }),
    true,
  );
  assert.equal(
    depositNeedsOwnerFollowUp({
      status: "pending",
      sentAt: new Date("2026-09-17T11:30:00.000Z"),
      now,
      afterHours: true,
    }),
    false,
  );
  assert.equal(
    depositNeedsOwnerFollowUp({
      status: "pending",
      sentAt: null,
      now,
      afterHours: true,
    }),
    false,
  );
});

test("deposit_failed is a board kind with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("deposit_failed"));
  assert.equal(attentionKindLabel("deposit_failed"), "Deposit");
  assert.equal(attentionActionStrategy("deposit_failed"), "call");
});
