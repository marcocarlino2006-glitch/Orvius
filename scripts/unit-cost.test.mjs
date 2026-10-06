import assert from "node:assert/strict";
import test from "node:test";

import {
  A2P_CAMPAIGN_CENTS_PER_MONTH,
  A2P_ONE_TIME_CENTS,
  costColumns,
  unitEconomics,
  NUMBER_CENTS_PER_MONTH,
  PHONE_MICROS_PER_MIN,
  SMS_MICROS_PER_TEXT,
  STRIPE_FEE_FIXED_CENTS,
  STRIPE_FEE_PCT,
} from "../src/lib/call-cost.ts";
import { unitCostLines } from "../src/lib/unit-cost-lines.ts";

test("the Vapi report's cost is stored in micros with its breakdown; junk is ignored", () => {
  assert.deepEqual(costColumns({ cost: 0.4213, costBreakdown: { stt: 0.03, llm: 0.21, tts: 0.12, vapi: 0.05 } }), {
    costMicros: 421_300,
    costJson: JSON.stringify({ stt: 30_000, llm: 210_000, tts: 120_000, vapi: 50_000 }),
  });
  assert.deepEqual(costColumns({ costBreakdown: { total: 0.1 } }), { costMicros: 100_000, costJson: null });
  assert.deepEqual(costColumns({}), {});
  assert.deepEqual(costColumns({ cost: -1 }), {});
  assert.deepEqual(costColumns({ cost: Number.NaN }), {});
});

test("cost per call adds the phone leg, and margins follow from the plan allowances", () => {
  const unit = unitEconomics([
    { costMicros: 400_000, durationSec: 120, costJson: JSON.stringify({ llm: 250_000, tts: 150_000 }) },
    { costMicros: 600_000, durationSec: 240, costJson: JSON.stringify({ llm: 350_000, tts: 250_000 }) },
  ]);
  const phone = (6 * PHONE_MICROS_PER_MIN) / 2;
  const perCall = (500_000 + phone) / 10_000;
  assert.equal(unit.calls, 2);
  assert.equal(unit.costPerCallCents, Math.round(perCall * 10) / 10);
  assert.equal(unit.biggestStage, "llm");
  assert.equal(unit.overageMarginCents, Math.round((50 - perCall) * 10) / 10);
  const line = unit.plans.find((p) => p.id === "line");
  assert.equal(line.includedCalls, 300);
  const fixed = NUMBER_CENTS_PER_MONTH + A2P_CAMPAIGN_CENTS_PER_MONTH + A2P_ONE_TIME_CENTS / 12 + 19_900 * (STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED_CENTS;
  assert.equal(line.marginAtAllowancePct, Math.round(((19_900 - 300 * perCall - fixed) / 19_900) * 100));
  assert.ok(!unit.plans.some((p) => p.id === "pilot" || p.id === "multi"), "free and sales-only plans are not priced here");
});

test("the board says when overage is priced below cost, and says so when there is no data", () => {
  const expensive = unitEconomics([{ costMicros: 700_000, durationSec: 180, costJson: null }]);
  assert.match(unitCostLines(expensive).join("\n"), /overage is priced below cost/);
  assert.deepEqual(unitCostLines(null), ["Cost per call: no call has reported a cost yet"]);
  assert.equal(unitEconomics([]), null);
});

test("each call carries its texts and its share of Ask; every plan its number, registration and card fee", () => {
  const calls = [{ costMicros: 400_000, durationSec: 120, costJson: null }];
  const bare = unitEconomics(calls);
  const texting = unitEconomics(calls, { textsPerCall: 3 });
  assert.equal(texting.textsPerCall, 3);
  assert.equal(Math.round((texting.costPerCallCents - bare.costPerCallCents) * 10) / 10, Math.round(((3 * SMS_MICROS_PER_TEXT) / 10_000) * 10) / 10);
  const line = texting.plans.find((p) => p.id === "line");
  assert.equal(line.fixedCents, Math.round(NUMBER_CENTS_PER_MONTH + A2P_CAMPAIGN_CENTS_PER_MONTH + A2P_ONE_TIME_CENTS / 12 + 19_900 * (STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED_CENTS));
  assert.ok(line.marginAtAllowancePct < bare.plans.find((p) => p.id === "line").marginAtAllowancePct);
  const asking = unitEconomics(calls, { askMicrosPerCall: 20_000 });
  assert.equal(asking.askCentsPerCall, 2);
  assert.equal(Math.round((asking.costPerCallCents - bare.costPerCallCents) * 10) / 10, 2);
  assert.match(unitCostLines(asking)[0], /2¢ of Ask/);
});
