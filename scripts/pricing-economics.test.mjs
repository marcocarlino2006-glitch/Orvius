/*
 * Prices are claims. "2 months free" has to be true for every plan, every
 * allowance has to leave margin at full use, and the meter a shop sees has to
 * agree with the plan it is on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ANNUAL_DISCOUNT_LABEL,
  OVERAGE_CENTS_PER_CALL,
  getPaidPlans,
  getPlanById,
} from "../src/lib/pricing-plans.ts";
import {
  callUsageLine,
  includedCallsForPlan,
  summarizeCallUsage,
  usagePeriodStart,
} from "../src/lib/call-usage.ts";
import { pricingFaq } from "../src/lib/pricing-faq.ts";

/* Measured on Vapi across 21 simulated calls (85s average). */
const MEASURED_COST_CENTS_PER_CALL = 11.7;

test("annual pricing is ten months for twelve on every plan", () => {
  assert.equal(ANNUAL_DISCOUNT_LABEL, "2 months free");
  for (const plan of getPaidPlans()) {
    assert.equal(
      plan.annualPrice,
      Math.round((plan.price * 10) / 12),
      `${plan.name} annual price does not match "2 months free"`,
    );
  }
});

test("every paid plan includes calls and keeps margin at full use", () => {
  for (const plan of getPaidPlans()) {
    assert.ok(plan.includedCalls && plan.includedCalls > 0, `${plan.name} has no allowance`);
    const costCents = plan.includedCalls * MEASURED_COST_CENTS_PER_CALL;
    const margin = 1 - costCents / (plan.annualPrice * 100);
    assert.ok(margin >= 0.55, `${plan.name} margin ${margin.toFixed(2)} at full allowance on annual`);
    assert.ok(
      plan.highlights.some((h) => h.includes(plan.includedCalls.toLocaleString("en-US"))),
      `${plan.name} does not say how many calls it includes`,
    );
  }
});

test("overage is priced above cost and allowances grow with the plan", () => {
  assert.ok(OVERAGE_CENTS_PER_CALL >= MEASURED_COST_CENTS_PER_CALL * 3);
  const [line, pro, fleet] = ["line", "pro", "fleet"].map((id) => getPlanById(id).includedCalls);
  assert.ok(line < pro && pro < fleet);
});

test("multi-shop is priced per location instead of 'not generally available'", () => {
  const multi = getPlanById("multi");
  assert.ok(multi.price > 0);
  assert.match(multi.period, /location/);
  assert.doesNotMatch(multi.tagline, /not generally available/i);
  assert.ok(multi.price <= getPlanById("pro").price, "per-location price should not exceed a single Pro");
});

test("the FAQ states the same allowances and overage the plans do", () => {
  const calls = pricingFaq.find((f) => f.id === "calls");
  assert.ok(calls);
  for (const id of ["line", "pro", "fleet"]) {
    assert.ok(calls.answer.includes(getPlanById(id).includedCalls.toLocaleString("en-US")));
  }
  assert.ok(calls.answer.includes(`${OVERAGE_CENTS_PER_CALL}¢`));
  const annual = pricingFaq.find((f) => f.id === "annual");
  for (const plan of getPaidPlans()) {
    assert.ok(annual.answer.includes(`$${plan.annualPrice}/mo`), `FAQ misstates ${plan.name} annual`);
  }
});

test("usage is metered against the plan, and pilot shops against Pro", () => {
  assert.equal(includedCallsForPlan("line"), 300);
  assert.equal(includedCallsForPlan(null), getPlanById("pro").includedCalls);
  assert.equal(includedCallsForPlan("pilot"), getPlanById("pro").includedCalls);

  const ok = summarizeCallUsage({ used: 120, planId: "line" });
  assert.deepEqual([ok.remaining, ok.overCalls, ok.tone], [180, 0, "ok"]);
  assert.equal(callUsageLine(ok), "120 of 300 included calls this month.");

  assert.equal(summarizeCallUsage({ used: 250, planId: "line" }).tone, "near");

  const over = summarizeCallUsage({ used: 340, planId: "line" });
  assert.deepEqual([over.overCalls, over.overageCents, over.fraction, over.tone], [40, 2000, 1, "over"]);
  assert.match(callUsageLine(over), /40 past the 300 included, every one answered/);
});

test("the metering window starts on the 1st in UTC", () => {
  assert.equal(
    usagePeriodStart(new Date("2026-09-26T15:00:00Z")).toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
});

test("the Stripe setup script creates the prices the site shows", () => {
  const src = readFileSync(new URL("./stripe-setup.mjs", import.meta.url), "utf8");
  for (const plan of getPaidPlans()) {
    const block = src.slice(src.indexOf(`id: "${plan.id}"`));
    const monthly = Number(block.match(/monthlyAmount:\s*(\d+)/)[1]);
    const annual = Number(block.match(/annualAmount:\s*(\d+)/)[1]);
    assert.equal(monthly, plan.price * 100, `${plan.name} monthly Stripe amount`);
    assert.equal(annual, plan.annualPrice * 1200, `${plan.name} annual Stripe amount`);
  }
});
