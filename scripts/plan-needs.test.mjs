#!/usr/bin/env node
import test from "node:test";
import assert from "node:assert/strict";

function recommendPlan(input) {
  const shopNeeds = [
    { id: "after-hours", planId: "line" },
    { id: "lead-to-job", planId: "pro" },
    { id: "dispatch-fleet", planId: "fleet" },
  ];
  const shopSizes = [
    { id: "solo", planId: "line" },
    { id: "growing", planId: "pro" },
    { id: "fleet", planId: "fleet" },
  ];

  const need = input.need ? shopNeeds.find((n) => n.id === input.need) : null;
  const size = input.size ? shopSizes.find((s) => s.id === input.size) : null;

  let planId = "pro";
  if (need && size) {
    const rank = { line: 1, pro: 2, fleet: 3 };
    planId = rank[need.planId] >= rank[size.planId] ? need.planId : size.planId;
  } else if (need) {
    planId = need.planId;
  } else if (size) {
    planId = size.planId;
  }

  return { planId };
}

test("missed calls need recommends Line", () => {
  assert.equal(recommendPlan({ need: "after-hours" }).planId, "line");
});

test("lead-to-job need recommends Pro", () => {
  assert.equal(recommendPlan({ need: "lead-to-job" }).planId, "pro");
});

test("fleet size upgrades recommendation", () => {
  assert.equal(
    recommendPlan({ need: "after-hours", size: "fleet" }).planId,
    "fleet",
  );
});
