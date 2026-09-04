import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPayPromptDecision } from "../src/lib/pay-prompt.ts";

describe("pay prompt loop", () => {
  it("hides for active subscribers", () => {
    const d = getPayPromptDecision({ billingStatus: "active", billingPlan: "pro" });
    assert.equal(d, null);
  });

  it("asks pilot shops to subscribe (soft loop)", () => {
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      shopCreatedAt: new Date().toISOString(),
    });
    assert.ok(d);
    assert.equal(d.show, true);
    assert.equal(d.tone, "trial");
  });

  it("tightens when pilot is late", () => {
    const old = new Date();
    old.setDate(old.getDate() - 25);
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      shopCreatedAt: old.toISOString(),
    });
    assert.ok(d);
    assert.equal(d.tone, "required");
  });

  it("urgent loop for past_due", () => {
    const d = getPayPromptDecision({ billingStatus: "past_due", billingPlan: "pro" });
    assert.ok(d);
    assert.equal(d.tone, "past_due");
    assert.ok(d.snoozeMs <= 60 * 60 * 1000);
  });
});
