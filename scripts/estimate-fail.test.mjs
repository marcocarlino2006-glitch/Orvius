import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateFailWaitMs,
  estimateNeedsOwnerFollowUp,
} from "../src/lib/estimate-fail.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("payment_failed estimates always need follow-up", () => {
  assert.equal(
    estimateNeedsOwnerFollowUp({ status: "payment_failed" }),
    true,
  );
  assert.equal(estimateNeedsOwnerFollowUp({ status: "draft" }), false);
});

test("stale sent estimates escalate; fresh ones do not", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(estimateFailWaitMs(true), 2 * 60 * 60_000);

  assert.equal(
    estimateNeedsOwnerFollowUp({
      status: "sent",
      sentAt: new Date("2026-09-17T09:00:00.000Z"),
      now,
      afterHours: true,
    }),
    true,
  );
  assert.equal(
    estimateNeedsOwnerFollowUp({
      status: "sent",
      sentAt: new Date("2026-09-17T11:00:00.000Z"),
      now,
      afterHours: true,
    }),
    false,
  );
});

test("estimate_failed and tech_needs_phone are board kinds", () => {
  assert.ok(ATTENTION_KINDS.includes("estimate_failed"));
  assert.ok(ATTENTION_KINDS.includes("tech_needs_phone"));
  assert.equal(attentionKindLabel("estimate_failed"), "Estimate due");
  assert.equal(attentionKindLabel("tech_needs_phone"), "Tech phone");
  assert.equal(attentionActionStrategy("estimate_failed"), "call");
  assert.equal(attentionActionStrategy("tech_needs_phone"), "open");
});
