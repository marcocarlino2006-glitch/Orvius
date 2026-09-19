import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";
import {
  concurrentCallsImpact,
  concurrentCallsRecommendedAction,
} from "../src/lib/concurrent-calls.ts";

test("two live calls are critical line-busy", () => {
  assert.equal(concurrentCallsImpact(2, false), "critical");
  assert.equal(concurrentCallsImpact(3, true), "critical");
  assert.equal(concurrentCallsRecommendedAction(2, false), "Confirm overflow");
  assert.equal(concurrentCallsRecommendedAction(2, true), "Open calls");
});

test("one live call is watch-the-line, tighter after hours", () => {
  assert.equal(concurrentCallsImpact(1, true), "high");
  assert.equal(concurrentCallsImpact(1, false), "med");
  assert.equal(concurrentCallsRecommendedAction(1, false), "Open call");
  assert.equal(concurrentCallsImpact(0, true), null);
});

test("concurrent_calls is a board kind with Open strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("concurrent_calls"));
  assert.equal(attentionKindLabel("concurrent_calls"), "Line busy");
  assert.equal(attentionActionStrategy("concurrent_calls"), "open");
});
