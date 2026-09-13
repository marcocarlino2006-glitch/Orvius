#!/usr/bin/env node
/*
 * Which plan a shop is pointed at on the pricing page.
 *
 * This file used to re-implement recommendPlan, and the copy returned only a
 * plan id. The real one also returns the name, the price and the sentence the
 * shop reads underneath — the parts a visitor actually sees, and the parts a
 * re-implementation quietly drops. It is imported now, and the recommendation
 * is checked whole.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  getNeedById,
  recommendPlan,
  shopNeeds,
  shopSizes,
} from "../src/lib/plan-needs.ts";
import { getPlanById } from "../src/lib/pricing-plans.ts";

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
    "the bigger of the two answers wins",
  );
  assert.equal(
    recommendPlan({ need: "dispatch-fleet", size: "solo" }).planId,
    "fleet",
    "and it wins from either side",
  );
});

test("no answers at all still points somewhere", () => {
  assert.equal(recommendPlan({}).planId, "pro");
});

test("the recommendation carries the price the shop will be quoted", () => {
  const recommendation = recommendPlan({ need: "lead-to-job", size: "growing" });
  const plan = getPlanById("pro");

  assert.equal(recommendation.planName, plan.name);
  assert.equal(recommendation.price, plan.price);
  assert.equal(recommendation.matchedNeed, "lead-to-job");
  assert.equal(recommendation.matchedSize, "growing");
  assert.match(recommendation.reason, /Growing shop \(3–5 trucks\)/);
});

test("every need and size resolves to a real plan", () => {
  /* The picker renders straight off these lists, so an entry pointing at a
     plan that does not exist is a page that throws in front of a buyer. */
  for (const need of shopNeeds) {
    assert.ok(getPlanById(need.planId), `need ${need.id} → ${need.planId}`);
    assert.equal(getNeedById(need.id).label, need.label);
  }
  for (const size of shopSizes) {
    assert.ok(getPlanById(size.planId), `size ${size.id} → ${size.planId}`);
  }
});

test("an unknown need is an error, not a silent default", () => {
  assert.throws(() => getNeedById("does-not-exist"), /Unknown need/);
});
