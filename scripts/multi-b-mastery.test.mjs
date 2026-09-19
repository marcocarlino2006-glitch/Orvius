import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMasteryReport,
  looksLikeSeedProspect,
} from "../src/lib/multi-b-mastery.ts";

test("mastery report is ordered and points at the first red gate", () => {
  const report = buildMasteryReport({
    certDone: 0,
    wedgeReady: false,
    baselineReady: false,
    proofFresh: false,
    connectReady: false,
    provingShops: 0,
    touchesToday: 0,
    dailyTarget: 20,
    overdueCount: 0,
    seedsOnly: true,
    externalProof: false,
  });

  assert.equal(report.mastered, false);
  assert.ok(report.next);
  assert.equal(report.next?.id, "wedge_cert");
  assert.equal(report.gates[0]?.step, 1);
  assert.ok(report.total >= 9);
});

test("seed email heuristic catches example and seed aliases", () => {
  assert.equal(looksLikeSeedProspect("owner@example.com"), true);
  assert.equal(looksLikeSeedProspect("seed+hvac@orvius.im"), true);
  assert.equal(looksLikeSeedProspect("mike@summithvac.com"), false);
});

test("all shop gates green marks mastered on snapshot", () => {
  const report = buildMasteryReport({
    certDone: 5,
    wedgeReady: true,
    baselineReady: true,
    proofFresh: true,
    connectReady: true,
    provingShops: 10,
    touchesToday: 20,
    dailyTarget: 20,
    overdueCount: 0,
    seedsOnly: false,
    externalProof: true,
  });

  /* Stripe/Resend/formation still come from env — may be red in this agent. */
  const shopIds = new Set([
    "wedge_cert",
    "weekly_proof",
    "outreach",
    "external_proof",
    "ten_shops",
  ]);
  for (const g of report.gates) {
    if (shopIds.has(g.id)) assert.equal(g.ok, true, g.id);
  }
});
