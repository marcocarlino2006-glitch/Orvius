/*
 * Overage is the one charge a shop does not click "pay" for, so every reason
 * not to bill is asserted: no subscription, already billed, inside the
 * allowance, or too small for Stripe to charge.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { decideOverage, previousPeriod } from "../src/lib/overage-billing.ts";

const base = {
  billingStatus: "active",
  billingPlan: "line",
  stripeCustomerId: "cus_test",
  overageBilledPeriod: null,
  periodKey: "2026-08",
};

test("the billed period is the calendar month just ended, in UTC", () => {
  const p = previousPeriod(new Date("2026-09-01T03:00:00Z"));
  assert.equal(p.key, "2026-08");
  assert.equal(p.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(p.end.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(previousPeriod(new Date("2026-01-15T00:00:00Z")).key, "2025-12");
});

test("calls past the allowance bill at 50 cents each", () => {
  assert.deepEqual(decideOverage({ ...base, callsInPeriod: 340 }), {
    bill: true,
    overCalls: 40,
    amountCents: 2000,
    included: 300,
    used: 340,
  });
});

test("nothing is billed without an active paid subscription", () => {
  for (const billingStatus of ["pilot", "past_due", "canceled", "none"]) {
    assert.equal(decideOverage({ ...base, billingStatus, callsInPeriod: 900 }).bill, false);
  }
  assert.equal(decideOverage({ ...base, stripeCustomerId: null, callsInPeriod: 900 }).bill, false);
});

test("a month is billed once, however often the cron runs", () => {
  assert.deepEqual(decideOverage({ ...base, overageBilledPeriod: "2026-08", callsInPeriod: 900 }), {
    bill: false,
    reason: "already_billed",
  });
  assert.equal(decideOverage({ ...base, overageBilledPeriod: "2026-07", callsInPeriod: 900 }).bill, true);
});

test("inside the allowance, or under Stripe's minimum, nothing is charged", () => {
  assert.equal(decideOverage({ ...base, callsInPeriod: 300 }).reason, "within_allowance");
  assert.equal(decideOverage({ ...base, callsInPeriod: 301 }).reason, "below_minimum");
  assert.equal(decideOverage({ ...base, callsInPeriod: 302 }).bill, true);
});
