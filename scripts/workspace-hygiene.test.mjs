import test from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateJobs,
  isFictionalPhone,
  isFixtureContact,
  realisticDemoSlots,
} from "../src/lib/workspace-hygiene.ts";
import { isDemoBusiness, workspaceEnvironment } from "../src/lib/demo-business.ts";

test("fixture contacts are recognised; real customers are not", () => {
  assert.equal(isFixtureContact({ name: "E2E Test Caller", phone: "+15125550999" }), true);
  assert.equal(isFixtureContact({ name: "Dana Caller", phone: "+14155550000" }), true);
  assert.equal(isFixtureContact({ name: "Maria Lopez", phone: "+15125550142" }), true);
  assert.equal(isFixtureContact({ name: "Priya", phone: "+15551234567" }), true);
  assert.equal(isFixtureContact({ name: "Sam", notes: "Automated dogfood test" }), true);

  assert.equal(isFixtureContact({ name: "Maria Lopez", phone: "+15124417788" }), false);
  assert.equal(isFixtureContact({ name: "Testa Plumbing", phone: "+15124417788" }), false);
  assert.equal(isFixtureContact({ name: "James Carter", phone: "+15125551212" }), false);
  assert.equal(isFictionalPhone("512-555-0100"), true);
  assert.equal(isFictionalPhone("512-555-0200"), false);
});

test("duplicate jobs keep the earliest and never drop money or started work", () => {
  const base = {
    businessId: "b",
    customerId: "c",
    serviceType: "AC not cooling",
    title: "AC",
    status: "scheduled",
    hasMoney: false,
  };
  const t = (h) => new Date(Date.UTC(2026, 8, 1, h));
  const pairs = findDuplicateJobs([
    { ...base, id: "j1", createdAt: t(9) },
    { ...base, id: "j2", createdAt: t(10) },
    { ...base, id: "j3", createdAt: t(11), hasMoney: true },
    { ...base, id: "j4", createdAt: t(12), status: "on_site" },
    { ...base, id: "j5", createdAt: t(13), serviceType: "Tune-up" },
    { ...base, id: "j6", createdAt: new Date(Date.UTC(2026, 8, 4, 9)) },
    { ...base, id: "j7", createdAt: t(9), customerId: "other" },
  ]);
  assert.deepEqual(pairs, [{ keep: "j1", drop: "j2" }]);
});

test("demo slots land on upcoming weekdays at appointment hours", () => {
  const friday = new Date(2026, 8, 25, 16, 0);
  const slots = realisticDemoSlots(6, friday);
  assert.equal(slots.length, 6);
  for (const slot of slots) {
    assert.ok(slot > friday);
    assert.ok(![0, 6].includes(slot.getDay()));
    assert.ok([8, 10, 13, 15].includes(slot.getHours()));
  }
  assert.equal(slots[0].getDay(), 1);
});

test("workspace environment decides what counts as a demo workspace", () => {
  assert.equal(workspaceEnvironment("demo"), "demo");
  assert.equal(workspaceEnvironment("test"), "test");
  assert.equal(workspaceEnvironment(undefined), "production");
  assert.equal(workspaceEnvironment("staging"), "production");
  assert.equal(isDemoBusiness({ slug: "acme", name: "Acme", environment: "demo" }), true);
  assert.equal(isDemoBusiness({ slug: "acme", name: "Acme", environment: "production" }), false);
  assert.equal(isDemoBusiness({ slug: "acme", name: "Acme", environment: "test" }), false);
});
