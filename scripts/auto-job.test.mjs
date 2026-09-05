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

function hasUsablePhone(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10;
}

function isLeadQualifiedForBooking(lead) {
  if (!hasUsablePhone(lead.phone)) return false;
  const service = lead.serviceType?.trim() ?? "";
  const address = lead.address?.trim() ?? "";
  if (service.length < 2 && address.length < 4) return false;
  if (!address && /^(sms inquiry|sms|text|unknown|n\/?a)$/i.test(service)) {
    return false;
  }
  return true;
}

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
