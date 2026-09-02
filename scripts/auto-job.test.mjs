#!/usr/bin/env node
import assert from "node:assert/strict";

function isAutoBookUrgency(urgency) {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  return (
    key.includes("emergency") ||
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  );
}

assert.equal(isAutoBookUrgency("emergency"), true);
assert.equal(isAutoBookUrgency("same-day"), true);
assert.equal(isAutoBookUrgency("today"), true);
assert.equal(isAutoBookUrgency("this-week"), false);
assert.equal(isAutoBookUrgency("flexible"), false);
assert.equal(isAutoBookUrgency(null), false);

console.log("auto-job.test.mjs: ok");
