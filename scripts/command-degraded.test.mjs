#!/usr/bin/env node
/*
 * A money read that fails on its own — e.g. a release selecting columns a
 * not-yet-migrated database lacks — degrades Command to "money paused"
 * with a critical, owner-honest issue. It never takes the screen down and
 * never presents paused money as real zeros without saying so.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/api/ring1/route.ts", import.meta.url), "utf8");
const center = readFileSync(new URL("../src/components/ring1-command-center.tsx", import.meta.url), "utf8");

test("money and outcomes reads are caught in the Command bundle, not fatal", () => {
  assert.match(route, /getShopOutcomes\(business\.id, 7\)\.catch/);
  assert.match(route, /getCommandMoney\(business\.id, now\)\.catch/);
  assert.match(route, /ring1\.money_failed/);
  assert.match(route, /ring1\.outcomes_failed/);
});

test("degraded outcomes fabricate nothing: no rate, no estimates, not economics-ready", async () => {
  const { degradedOutcomes, MONEY_PAUSED_ISSUE } = await import("../src/lib/command-degraded.ts");
  const out = degradedOutcomes(new Date("2026-10-19T12:00:00.000Z"));
  assert.equal(out.bookingRate, null);
  assert.equal(out.economicsReady, false);
  assert.equal(out.estimatedPipelineCents, null);
  assert.equal(out.avgTicketCents, null);
  assert.deepEqual(out.weeks, []);
  assert.equal(MONEY_PAUSED_ISSUE.severity, "critical");
  assert.match(MONEY_PAUSED_ISSUE.detail, /no money data is lost/);
});

test("the paused-money state is loud on Command, and the strip never claims 'nothing outstanding'", () => {
  assert.match(route, /MONEY_PAUSED_ISSUE, \.\.\.work\.shopIssues/);
  assert.match(readFileSync(new URL("../src/lib/command-degraded.ts", import.meta.url), "utf8"), /title: "Money numbers are paused"/);
  assert.match(center, /Money isn't loading right now/);
  assert.doesNotMatch(center, /money\?\.outstandingCents \? `\$\{formatCents\(money\.outstandingCents\)\} still owed` : "Nothing outstanding"/);
});
