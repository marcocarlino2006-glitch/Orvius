import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBillingEntitled,
  isPilotExpired,
} from "../src/lib/billing-entitlement.ts";
import { getPayPromptDecision } from "../src/lib/pay-prompt.ts";
import { canAccessModule, getEffectivePlanId } from "../src/lib/plan-features.ts";

describe("billing entitlement", () => {
  it("active is entitled", () => {
    assert.equal(
      isBillingEntitled({ billingStatus: "active", billingPlan: "pro" }),
      true,
    );
  });

  it("expired pilot is not entitled", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 1);
    assert.equal(
      isBillingEntitled({
        billingStatus: "pilot",
        pilotEndsAt: ends.toISOString(),
      }),
      false,
    );
    assert.equal(
      isPilotExpired({ billingStatus: "pilot", pilotEndsAt: ends }),
      true,
    );
  });

  it("expired plan has no modules", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 1);
    const plan = getEffectivePlanId({
      billingStatus: "pilot",
      pilotEndsAt: ends,
    });
    assert.equal(plan, "expired");
    assert.equal(canAccessModule(plan, "inbox"), false);
  });
});

describe("pay prompt loop", () => {
  it("hides for active subscribers", () => {
    const d = getPayPromptDecision({ billingStatus: "active", billingPlan: "pro" });
    assert.equal(d, null);
  });

  it("asks mid-trial pilots softly", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() + 20);
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: ends.toISOString(),
      shopCreatedAt: new Date().toISOString(),
    });
    assert.ok(d);
    assert.equal(d.show, true);
    assert.equal(d.hard, false);
    assert.ok(d.snoozeMs <= 4 * 60 * 60 * 1000);
  });

  it("locks when pilot ended", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 2);
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: ends.toISOString(),
    });
    assert.ok(d);
    assert.equal(d.tone, "locked");
    assert.equal(d.hard, true);
  });

  it("urgent lock for past_due", () => {
    const d = getPayPromptDecision({ billingStatus: "past_due", billingPlan: "pro" });
    assert.ok(d);
    assert.equal(d.tone, "past_due");
    assert.equal(d.hard, true);
    assert.equal(d.snoozeMs, 0);
  });
});
