#!/usr/bin/env node
/*
 * Overage economics are observed, not acted on: the report runs on synthetic
 * cost-tail fixtures, reconciles cost and revenue with provenance on every
 * line, keeps pilots, the sub-dollar waiver and past-due shops visible, and
 * changes no price, allowance or answering behaviour.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { overageEconomicsReport, LONG_CALL_SEC } from "../src/lib/overage-economics.ts";
import { OVERAGE_CENTS_PER_CALL, getPlanById } from "../src/lib/pricing-plans.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/overage-cost-tail.json", import.meta.url), "utf8"));
const now = new Date(fixture.now);

function expand(batches) {
  const calls = [];
  for (const b of batches) {
    for (let i = 0; i < b.count; i++) {
      calls.push({
        id: `${b.businessId}-${b.tag ?? "c"}-${i}`,
        businessId: b.businessId,
        at: new Date(now.getTime() - (1 + (i % 28)) * 86_400_000).toISOString(),
        answered: b.answered ?? true,
        durationSec: b.durationSec,
        costMicros: b.costMicros,
        urgent: Boolean(b.urgent),
        humanTransfer: Boolean(b.humanTransfer),
      });
    }
  }
  // Outside the 30-day window: never counted.
  calls.push({ id: "old", businessId: "s-month", at: "2026-08-01T00:00:00.000Z", answered: true, durationSec: 100, costMicros: 100000 });
  return calls;
}
const input = { ...fixture, calls: expand(fixture.batches) };
const report = overageEconomicsReport(input, { now });

test("prices, the overage rate and allowances are untouched", () => {
  assert.equal(OVERAGE_CENTS_PER_CALL, 50);
  assert.equal(report.overage.centsPerCall, 50);
  assert.deepEqual([getPlanById("line").price, getPlanById("pro").price, getPlanById("fleet").price], [199, 399, 749]);
  const src = readFileSync(new URL("../src/lib/overage-economics.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /prisma|stripe\.|getStripe|twilio|fetch\(/i, "pure: reads nothing live, writes nothing");
});

test("the report observes only: no cutoff, throttle or price decision anywhere in it", () => {
  assert.equal(report.policy, "observe_only");
  assert.doesNotMatch(JSON.stringify(report), /cutoff|throttle|suspend|block|stopAnswering|newPrice/i);
});

test("the billable denominator excludes demos, self-tests, pilots, unanswered and out-of-window calls, and says how many", () => {
  assert.equal(report.window.days, 30);
  assert.equal(report.denominator.billableCalls, 99 + 45 + 33);
  assert.equal(report.denominator.billableShops, 3);
  assert.deepEqual(report.denominator.excluded, { demo: 50, test: 0, selfTest: 4, pilot: 25, unanswered: 1, unknownShop: 0 });
});

test("cost coverage and provenance are explicit", () => {
  assert.equal(report.coverage.callsWithReportedCost, 172);
  assert.equal(report.coverage.callCostCoveragePct, 97.2);
  assert.equal(report.costs.voice.source, "provider_reported");
  assert.equal(report.costs.telephony.source, "estimate_list_rate");
  assert.equal(report.costs.sms.source, "mixed");
  assert.equal(report.coverage.texts, 2, "the demo shop's texts are not a cost of real shops");
  assert.equal(report.costs.model.source, "metered");
  assert.equal(report.costs.model.cents, 150, "pilot model spend is not charged to paying shops");
  assert.equal(report.costs.numbers.source, "mixed");
  assert.equal(report.costs.a2p.source, "estimate");
  assert.equal(report.costs.storage.cents, 12);
});

test("distributions and the cost tail, long, urgent and transfer calls are shown with their share of cost", () => {
  const d = report.distributions.callCostMicros;
  assert.equal(d.n, 177);
  assert.ok(d.p50 < d.p90 && d.p90 <= d.p99 && d.p99 <= d.max);
  assert.ok(report.exceptions.costTail.callIds.includes("s-month-tail-0"));
  assert.equal(report.exceptions.long.count, 3, `calls of ${LONG_CALL_SEC}s or more`);
  assert.equal(report.exceptions.urgent.count, 30);
  assert.equal(report.exceptions.humanTransfer.count, 3);
  assert.ok(report.exceptions.costTail.costSharePct > 0);
});

test("monthly and annual revenue are effective, not list: discounts off, annual spread over the year", () => {
  assert.deepEqual(report.revenue.monthly, { invoices: 2, invoicedCents: 39900 + 19900, discountsCents: 0, collectedCents: 39900, recognisedCents: 39900 });
  assert.equal(report.revenue.annual.collectedCents, 199200 - 19920);
  assert.equal(report.revenue.annual.recognisedCents, Math.round(((199200 - 19920) * 30) / 365));
  assert.equal(report.revenue.annual.discountsCents, 19920);
});

test("overage is reconciled by outcome, and the sub-dollar waiver is visible", () => {
  const o = report.overage;
  assert.deepEqual(o.invoiced, { count: 5, cents: 6000 }, "the demo shop's overage is excluded");
  assert.deepEqual(o.collected, { count: 1, cents: 1500 });
  assert.deepEqual(o.failed, { count: 1, cents: 2500 });
  assert.deepEqual(o.refunded, { count: 1, cents: 1000 });
  assert.deepEqual(o.disputed, { count: 1, cents: 700 });
  assert.deepEqual(o.outstanding, { count: 1, cents: 300 });
  assert.equal(o.waived.count, 1);
  assert.equal(o.waived.cents, 50);
});

test("past-due shops keep being answered and their unpaid overage shows; pilots show as never billed", () => {
  assert.deepEqual(report.pastDue, [{ businessId: "s-late", callsAnswered: 33, overageOutstandingCents: 2800 }]);
  assert.deepEqual(report.pilots, [{ businessId: "s-pilot", callsAnswered: 25, billed: false }]);
});

test("cohorts by signup month carry calls, cost and collected money", () => {
  assert.deepEqual(report.cohorts.map((c) => [c.signupMonth, c.shops, c.billableCalls]), [
    ["2026-07", 1, 99],
    ["2026-08", 2, 78],
  ]);
  assert.equal(report.cohorts[0].collectedCents, 39900 + 1500);
});
