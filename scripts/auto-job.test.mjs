#!/usr/bin/env node
import assert from "node:assert/strict";

function isPriorityUrgency(urgency) {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  return (
    key.includes("emergency") ||
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  );
}

assert.equal(isPriorityUrgency("emergency"), true);
assert.equal(isPriorityUrgency("same-day"), true);
assert.equal(isPriorityUrgency("today"), true);
assert.equal(isPriorityUrgency("this-week"), false);
assert.equal(isPriorityUrgency("flexible"), false);
assert.equal(isPriorityUrgency(null), false);

console.log("auto-job.test.mjs: ok");
