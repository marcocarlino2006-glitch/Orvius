import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowStages,
} from "../src/lib/command-today.ts";

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
