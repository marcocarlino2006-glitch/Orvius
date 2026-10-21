import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SETTINGS_PLACES, SETTINGS_SEARCH, SETTINGS_SECTIONS, placeFor, searchSettings } from "../src/lib/settings-center.ts";

test("every searchable setting opens a real section", () => {
  const ids = new Set(SETTINGS_SECTIONS.map((s) => s.id));
  for (const item of SETTINGS_SEARCH) assert.ok(ids.has(item.section), item.label);
});

test("the rail is six places, and every section belongs to one of them", () => {
  const seen = new Map();
  for (const place of SETTINGS_PLACES) {
    assert.ok(place.label.length <= 20, place.label);
    assert.ok(place.sections.length >= 1, place.label);
    for (const item of place.sections) {
      assert.equal(seen.has(item.id), false, `${item.id} is in two places`);
      seen.set(item.id, place.id);
    }
  }
  for (const section of SETTINGS_SECTIONS) {
    assert.equal(placeFor(section.id)?.id, seen.get(section.id), section.id);
  }
  assert.equal(SETTINGS_PLACES.filter((place) => place.id !== "internal").length, 6);
  const center = readFileSync(new URL("../src/components/settings-center/settings-center.tsx", import.meta.url), "utf8");
  assert.match(center, /places\.map/);
  assert.match(center, /className="sc-place-row"/);
  assert.match(center, /className="sc-crumb"/);
  assert.match(center, /if \(!aboutTheLine\) return null/, "the line warning stays on the pages that change the line");
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
