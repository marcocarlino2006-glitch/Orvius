import assert from "node:assert/strict";
import test from "node:test";

const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
const classify = (trade, text) =>
  classifyRequest({ business: { trade }, serviceType: text, summary: `Caller reports: ${text.toLowerCase()}.`, callerWords: text });

test("a leaking dishwasher is same-day work, not a never-book emergency", () => {
  assert.equal(classify("Appliance repair", "Dishwasher leaking").urgency, "same-day");
  assert.equal(classify("Appliance repair", "Washer leaking onto the floor").urgency, "same-day");
});

test("flooding appliances stay emergencies, and real hazards stay safety", () => {
  assert.equal(classify("Appliance repair", "Dishwasher flooding the kitchen").urgency, "emergency");
  assert.equal(classify("Appliance repair", "Washer pouring water and we can't shut it off").urgency, "emergency");
  assert.equal(classify("Appliance repair", "The dryer is smoking").safety?.key, "appliance_fire");
  assert.equal(classify("HVAC", "AC not cooling").urgency, "same-day");
});
