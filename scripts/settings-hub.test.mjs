import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsHub } from "../src/lib/settings-hub.ts";

test("incomplete shop is pointed at call capture first", () => {
  const hub = buildSettingsHub({
    lineVerified: false,
    overflowConfirmed: false,
    ownerPhone: null,
  });
  assert.equal(hub.next?.id, "capture");
  assert.ok(hub.doneCount < hub.totalCount);
});

test("capture done next asks for owner mobile", () => {
  const hub = buildSettingsHub({
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: null,
  });
  assert.equal(hub.next?.id, "alerts");
});

test("alerts done next asks for complete profile when email missing", () => {
  const hub = buildSettingsHub({
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: "+15551234567",
    shopName: "Summit HVAC",
    ownerEmail: null,
    avgTicketCents: 28500,
    billingConfigured: true,
  });
  assert.equal(hub.next?.id, "profile");
  assert.ok(hub.items.some((item) => item.id === "profile"));
});

test("owner hub never lists founder Resend/cert/money rows", () => {
  const hub = buildSettingsHub({
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: "+15551234567",
    ownerEmail: "mike@summithvac.com",
    shopName: "Summit HVAC",
    avgTicketCents: 28500,
    billingConfigured: true,
  });
  assert.equal(hub.next, null);
  assert.ok(!hub.items.some((item) => item.id === "resend"));
  assert.ok(!hub.items.some((item) => item.id === "cert"));
  assert.ok(!hub.items.some((item) => item.id === "money"));
});

test("settings hub links founder-free — profile is a first-class jump", () => {
  const hub = buildSettingsHub({
    lineVerified: true,
    overflowConfirmed: true,
    ownerPhone: "+15551234567",
  });
  const profile = hub.items.find((item) => item.id === "profile");
  assert.equal(profile?.href, "/dashboard/profile");
});
