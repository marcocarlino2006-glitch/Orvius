#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  inferExplicitUrgency,
  isLeadQualifiedForBooking,
  isPriorityUrgency,
} from "../src/lib/auto-job.ts";

/** Mirrors maybeAutoBookLead plan gate without Prisma. */
function shouldAutoBook({ qualified, hasJobsModule, urgency }) {
  if (!qualified) return { book: false, skipReason: "unqualified" };
  const priority = isPriorityUrgency(urgency);
  if (!hasJobsModule && !priority) {
    return { book: false, skipReason: "plan_blocked" };
  }
  return { book: true };
}

assert.equal(isPriorityUrgency("emergency"), true);
assert.equal(isPriorityUrgency("same-day"), true);
assert.equal(isPriorityUrgency("today"), true);
assert.equal(isPriorityUrgency("this-week"), false);
assert.equal(isPriorityUrgency("flexible"), false);
assert.equal(isPriorityUrgency(null), false);
assert.equal(inferExplicitUrgency("burst pipe, water everywhere"), "emergency");
assert.equal(inferExplicitUrgency("need help today please"), "same-day");
assert.equal(inferExplicitUrgency("sometime this week"), "this-week");
assert.equal(inferExplicitUrgency("no rush, whenever works"), "flexible");
assert.equal(inferExplicitUrgency("my water heater is making noise"), null);

assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: "AC repair",
    address: null,
  }),
  true,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: null,
    address: "12 Main St",
  }),
  true,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "555",
    serviceType: "AC repair",
    address: "12 Main St",
  }),
  false,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: "SMS inquiry",
    address: null,
    categoryCode: "plumb.water_heater",
  }),
  true,
  "a classified SMS request is real demand even before an address is parsed",
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: "SMS inquiry",
    address: null,
  }),
  false,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: "unknown",
    address: null,
  }),
  false,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: null,
    address: null,
  }),
  false,
);
assert.equal(
  isLeadQualifiedForBooking({
    phone: "+15551234567",
    serviceType: "calling about advertising for your furnace business",
    address: null,
    categoryCode: "other.non_service",
  }),
  false,
);

assert.deepEqual(
  shouldAutoBook({
    qualified: true,
    hasJobsModule: false,
    urgency: "emergency",
  }),
  { book: true },
);
assert.deepEqual(
  shouldAutoBook({
    qualified: true,
    hasJobsModule: false,
    urgency: "this-week",
  }),
  { book: false, skipReason: "plan_blocked" },
);
assert.deepEqual(
  shouldAutoBook({
    qualified: true,
    hasJobsModule: true,
    urgency: "flexible",
  }),
  { book: true },
);
assert.deepEqual(
  shouldAutoBook({
    qualified: false,
    hasJobsModule: true,
    urgency: "emergency",
  }),
  { book: false, skipReason: "unqualified" },
);

console.log("auto-job.test.mjs: ok");
