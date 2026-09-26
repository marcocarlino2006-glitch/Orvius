import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_SEARCH, SETTINGS_SECTIONS, searchSettings } from "../src/lib/settings-center.ts";

test("every searchable setting opens a real section", () => {
  const ids = new Set(SETTINGS_SECTIONS.map((s) => s.id));
  for (const item of SETTINGS_SEARCH) assert.ok(ids.has(item.section), item.label);
});

test("owners find settings in their own words", () => {
  const first = (q) => searchSettings(q)[0]?.section;
  assert.equal(first("transfer"), "receptionist");
  assert.equal(first("verizon"), "phone");
  assert.equal(first("greeting"), "receptionist");
  assert.equal(first("cancel subscription"), "billing");
  assert.equal(first("zip"), "hours");
  assert.deepEqual(searchSettings("   "), []);
  assert.deepEqual(searchSettings("zzzz"), []);
});
