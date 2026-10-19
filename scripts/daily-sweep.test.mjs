#!/usr/bin/env node
/*
 * The daily sweep is a best-effort cron with no retries. A failed or cut-short
 * run must say so in its HTTP status, two invocations must not run at once,
 * and a step that keeps losing to the deadline must go first next time.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { claimDailyRun, markDailyStep, dailyStepSuccesses, oldestFirst } = await import("../src/lib/cron-runs.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const route = readFileSync(new URL("../src/app/api/cron/notifications/route.ts", import.meta.url), "utf8");

test("one daily run at a time; the claim frees up after the lease", async () => {
  await prisma.cronRun.deleteMany({ where: { name: "daily" } });
  const t = new Date("2026-10-15T17:00:00Z");
  const both = await Promise.all([claimDailyRun(t), claimDailyRun(t)]);
  assert.deepEqual(both.sort(), [false, true]);
  assert.equal(await claimDailyRun(new Date(t.getTime() + 30_000)), false);
  assert.equal(await claimDailyRun(new Date(t.getTime() + 56_000)), true);
});

test("each step's last success is durable, and the longest-waiting step goes first", async () => {
  const steps = [`a-${Date.now()}`, `b-${Date.now()}`, `c-${Date.now()}`];
  await markDailyStep(steps[0], new Date("2026-10-14T17:00:00Z"));
  await markDailyStep(steps[2], new Date("2026-10-10T17:00:00Z"));
  const seen = await dailyStepSuccesses(steps);
  assert.equal(seen.get(steps[1]), null);
  assert.deepEqual(oldestFirst(steps, seen), [steps[1], steps[2], steps[0]]);
});

test("the route refuses overlap, stamps steps, and answers non-200 when a step failed or was skipped", () => {
  assert.match(route, /if \(!\(await claimDailyRun\(\)\)\)[\s\S]{0,160}status: 409/);
  assert.match(route, /await markDailyStep\(name\)/);
  assert.match(route, /if \(ok\) await markDailyStep\("all"\)/);
  assert.match(route, /status: ok \? 200 : failed\.length \? 500 : 503/);
  assert.match(route, /oldestFirst\(names/);
  assert.ok(route.indexOf('"overage_billing"') < route.indexOf("oldestFirst("), "money still runs before housekeeping");
});

test.after(() => prisma.$disconnect());
