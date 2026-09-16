#!/usr/bin/env node
/*
 * When a shop is asked to pay, and when it is locked out.
 *
 * This is the most expensive thing in the repo to get wrong in either
 * direction: too eager and a design partner is locked out of a live line
 * mid-shift, too lax and the pilot never ends. It was also the largest mirror
 * — a hundred lines re-implementing billing-entitlement, plan-features and
 * pay-prompt, none of it imported. The copies dropped every string, so the
 * headline a locked-out owner reads was graded by nothing at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PILOT_DAYS,
  billingLockReason,
  defaultPilotEndsAt,
  isBillingEntitled,
  isPilotExpired,
  resolvePilotEndsAt,
} from "../src/lib/billing-entitlement.ts";
import { canAccessModule, getEffectivePlanId } from "../src/lib/plan-features.ts";
import { getPayPromptDecision } from "../src/lib/pay-prompt.ts";

const HOUR = 60 * 60 * 1000;
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

describe("billing entitlement", () => {
  it("active is entitled", () => {
    assert.equal(isBillingEntitled({ billingStatus: "active", billingPlan: "pro" }), true);
  });

  it("past_due keeps the line up while Stripe retries", () => {
    assert.equal(isBillingEntitled({ billingStatus: "past_due", billingPlan: "pro" }), true);
    assert.equal(billingLockReason({ billingStatus: "past_due" }), "past_due");
  });

  it("expired pilot is not entitled", () => {
    const ends = daysFromNow(-1);
    assert.equal(
      isBillingEntitled({ billingStatus: "pilot", pilotEndsAt: ends.toISOString() }),
      false,
    );
    assert.equal(isPilotExpired({ billingStatus: "pilot", pilotEndsAt: ends }), true);
    assert.equal(
      billingLockReason({ billingStatus: "pilot", pilotEndsAt: ends }),
      "trial_ended",
    );
  });

  it("canceled is locked even inside the pilot window", () => {
    assert.equal(
      isBillingEntitled({ billingStatus: "canceled", pilotEndsAt: daysFromNow(20) }),
      false,
    );
    assert.equal(billingLockReason({ billingStatus: "canceled" }), "canceled");
  });

  it("a shop with no dates on it is not locked out", () => {
    /* Nothing to measure against is not evidence the pilot ended, and the
       failure mode here is a live shop losing its line mid-shift. */
    assert.equal(resolvePilotEndsAt({}), null);
    assert.equal(isPilotExpired({}), false);
    assert.equal(isBillingEntitled({}), true);
  });

  it("the pilot window is measured from signup when no end date was set", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const ends = resolvePilotEndsAt({ createdAt: created });
    assert.equal(
      Math.round((ends.getTime() - created.getTime()) / (24 * HOUR)),
      PILOT_DAYS,
    );
    assert.equal(
      defaultPilotEndsAt(created).toISOString(),
      ends.toISOString(),
      "signup and the default agree, so a shop cannot be given two deadlines",
    );
  });

  it("an unreadable date is ignored rather than treated as expired", () => {
    assert.equal(resolvePilotEndsAt({ pilotEndsAt: "not a date" }), null);
    assert.equal(isBillingEntitled({ billingStatus: "pilot", pilotEndsAt: "not a date" }), true);
  });

  it("expired plan has no modules", () => {
    const plan = getEffectivePlanId({ billingStatus: "pilot", pilotEndsAt: daysFromNow(-1) });
    assert.equal(plan, "expired");
    assert.equal(canAccessModule(plan, "inbox"), false);
    assert.equal(canAccessModule(plan, "today"), false);
  });

  it("Line buys the night shift, not the whole workspace", () => {
    const plan = getEffectivePlanId({ billingStatus: "active", billingPlan: "line" });
    assert.equal(plan, "line");
    assert.equal(canAccessModule("line", "today"), true);
    assert.equal(canAccessModule("line", "inbox"), true);
    assert.equal(canAccessModule("line", "dispatch"), false);
    assert.equal(canAccessModule("pro", "dispatch"), true);
  });

  it("a past_due subscriber keeps the plan they paid for", () => {
    assert.equal(
      getEffectivePlanId({ billingStatus: "past_due", billingPlan: "fleet" }),
      "fleet",
    );
  });
});

describe("pay prompt loop", () => {
  it("hides for active subscribers", () => {
    assert.equal(getPayPromptDecision({ billingStatus: "active", billingPlan: "pro" }), null);
  });

  it("asks mid-trial pilots softly", () => {
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: daysFromNow(20).toISOString(),
      shopCreatedAt: new Date().toISOString(),
    });
    assert.equal(d.show, true);
    assert.equal(d.tone, "trial");
    assert.equal(d.hard, false);
    assert.ok(d.snoozeMs <= 4 * HOUR);
  });

  it("sharpens in the last week and counts the days down", () => {
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: daysFromNow(3).toISOString(),
    });
    assert.equal(d.tone, "required");
    assert.equal(d.hard, false, "a shop still inside its pilot is never blocked");
    assert.equal(d.snoozeMs, 2 * HOUR);
    assert.match(d.headline, /Pilot ends in 3 days/);
  });

  it("locks when pilot ended", () => {
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: daysFromNow(-2).toISOString(),
    });
    assert.equal(d.tone, "locked");
    assert.equal(d.hard, true);
    assert.match(d.headline, /Pilot ended/);
    assert.match(d.primaryCta, /Subscribe/);
  });

  it("tells a canceled shop something different from a lapsed one", () => {
    const canceled = getPayPromptDecision({ billingStatus: "canceled" });
    assert.equal(canceled.tone, "locked");
    assert.match(canceled.headline, /reopen your shop/);
  });

  it("urgent lock for past_due", () => {
    const d = getPayPromptDecision({ billingStatus: "past_due", billingPlan: "pro" });
    assert.equal(d.tone, "past_due");
    assert.equal(d.hard, true);
    assert.equal(d.snoozeMs, 0, "no snooze while a payment is failing");
    assert.match(d.primaryCta, /payment/i);
  });

  it("every prompt it can produce is fully written", () => {
    /* The mirror returned bare flags, so a prompt could have shipped with an
       empty headline and this file would have called it correct. */
    const cases = [
      { billingStatus: "past_due", billingPlan: "pro" },
      { billingStatus: "canceled" },
      { billingStatus: "pilot", pilotEndsAt: daysFromNow(-2).toISOString() },
      { billingStatus: "pilot", pilotEndsAt: daysFromNow(3).toISOString() },
      { billingStatus: "pilot", pilotEndsAt: daysFromNow(20).toISOString() },
      { billingStatus: "none", pilotEndsAt: daysFromNow(20).toISOString() },
    ];

    for (const shop of cases) {
      const d = getPayPromptDecision(shop);
      assert.ok(d, `${shop.billingStatus} produces a prompt`);
      for (const field of ["headline", "body", "primaryCta"]) {
        assert.ok(
          typeof d[field] === "string" && d[field].trim().length > 0,
          `${shop.billingStatus} prompt has a ${field}`,
        );
      }
    }
  });
});
