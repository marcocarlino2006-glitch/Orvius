import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCommandBriefing,
  buildWorkflowStages,
  todayHasMeasuredActivity,
} from "../src/lib/command-today.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("workflow strip lights measured and waiting stages from today facts", () => {
  const stages = buildWorkflowStages({
    callsToday: 3,
    leadsToday: 2,
    jobsToday: 1,
    unresolved: 2,
    urgentOpen: 1,
    collectedCents: 0,
    alertsProven: true,
  });

  assert.equal(stages.find((s) => s.id === "call")?.state, "measured");
  assert.equal(stages.find((s) => s.id === "qualify")?.state, "waiting");
  assert.equal(stages.find((s) => s.id === "book")?.state, "measured");
  assert.equal(stages.find((s) => s.id === "alert")?.state, "measured");
  assert.equal(stages.find((s) => s.id === "paid")?.state, "idle");
});

test("empty day stays idle without inventing activity", () => {
  const stages = buildWorkflowStages({
    callsToday: 0,
    leadsToday: 0,
    jobsToday: 0,
    unresolved: 0,
    urgentOpen: 0,
    collectedCents: 0,
  });
  assert.ok(stages.every((s) => s.state === "idle"));
});

test("briefing sentence stays measured and omits zero fillers", () => {
  const idle = {
    since: new Date().toISOString(),
    callsAnswered: 0,
    missedRecovered: 0,
    qualifiedLeads: 0,
    appointmentsBooked: 0,
    urgentOpen: 0,
    unresolved: 0,
    estimatedJobValueCents: null,
    collectedCents: 0,
    avgTicketCents: null,
  };
  assert.equal(todayHasMeasuredActivity(idle), false);
  const quiet = buildCommandBriefing(idle, 0);
  assert.match(quiet.sentence, /quiet so far/);
  assert.equal(quiet.metrics.length, 0);

  const active = buildCommandBriefing(
    {
      ...idle,
      callsAnswered: 12,
      qualifiedLeads: 5,
      appointmentsBooked: 3,
      estimatedJobValueCents: 240_000,
    },
    2,
  );
  assert.match(active.sentence, /12 calls answered/);
  assert.match(active.sentence, /5 qualified leads/);
  assert.match(active.sentence, /3 appointments booked/);
  assert.match(active.sentence, /\$2,400 estimated revenue/);
  assert.match(active.sentence, /2 items need your attention/);
  assert.ok(active.metrics.every((m) => m.href));
  assert.ok(active.metrics.some((m) => m.id === "calls" && m.href === "/dashboard/calls"));
});

test("Command briefing UI ships empty state and clickable metrics", () => {
  const outcomes = read("src/components/pro-command-outcomes.tsx");
  assert.match(outcomes, /buildCommandBriefing/);
  assert.match(outcomes, /pro-command-empty/);
  assert.match(outcomes, /Activate live line|Prove the line/);
  assert.match(outcomes, /pro-command-metric/);
});
