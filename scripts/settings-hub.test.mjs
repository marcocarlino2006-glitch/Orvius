import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsHub } from "../src/lib/settings-hub.ts";

test("incomplete shop is pointed at call capture first", () => {
  const hub = buildSettingsHub({
    founder: false,
    lineVerified: false,
    overflowConfirmed: false,
    ownerPhone: null,
  });
  assert.equal(hub.next?.id, "capture");
  assert.ok(hub.doneCount < hub.totalCount);
});

test("capture done next asks for owner mobile", () => {
  const hub = buildSettingsHub({
    founder: false,
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: null,
  });
  assert.equal(hub.next?.id, "alerts");
});

test("founder with capture+alerts is pointed at money setup", () => {
  const hub = buildSettingsHub({
    founder: true,
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: "+15551234567",
    billingConfigured: false,
    billingFullyReady: false,
    emailConfigured: false,
    avgTicketCents: 28500,
  });
  assert.equal(hub.next?.id, "money");
  assert.ok(hub.items.some((item) => item.id === "money"));
});

test("owner hub never lists founder-only money rows", () => {
  const hub = buildSettingsHub({
    founder: false,
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: "+15551234567",
    avgTicketCents: 28500,
    billingConfigured: true,
  });
  assert.equal(hub.next, null);
  assert.ok(!hub.items.some((item) => item.founderOnly));
});
