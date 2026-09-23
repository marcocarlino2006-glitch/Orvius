import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnerLeadAlertMessage } from "../src/lib/owner-alert-message.ts";

test("capacity skip is named on the owner alert", () => {
  const msg = buildOwnerLeadAlertMessage({
    lead: {
      name: "Jordan",
      phone: "+15555550123",
      serviceType: "AC not cooling",
      urgency: "same-day",
      address: "1842 Oak",
    },
    autoBooked: false,
    skipReason: "capacity_unavailable",
  });
  assert.match(msg, /No open window/i);
  assert.match(msg, /call to schedule/i);
});

test("auto-booked still shows proposed window, not capacity theater", () => {
  const msg = buildOwnerLeadAlertMessage({
    lead: { phone: "+15555550123", serviceType: "AC" },
    job: { scheduledAt: "2026-09-09T16:00:00.000Z" },
    autoBooked: true,
    skipReason: "capacity_unavailable",
  });
  assert.match(msg, /Proposed window/);
  assert.doesNotMatch(msg, /No open window/);
});
