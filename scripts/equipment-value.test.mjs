/**
 * System, brand, and model each have to be something the visit can use.
 * A price, a guess, and a mumbled word stay off the record.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { equipmentFacts, modelOnFile, rememberEquipment, resolveEquipment } = await import("../src/lib/equipment-fact.ts");
const { extractLeadFromStructuredData } = await import("../src/lib/vapi.ts");

test("a named machine, its manufacturer, and a sticker number each become one fact", () => {
  const resolved = resolveEquipment(
    { systemType: "central AC", equipmentBrand: "carrier", equipmentModel: "24 acc 636a003" },
    "HVAC",
  );
  assert.deepEqual(resolved, {
    systemType: "Central air",
    equipmentBrand: "Carrier",
    equipmentModel: "24ACC636A003",
    parts: "Carrier parts",
  });
  assert.deepEqual(equipmentFacts(resolved), {
    system: "Central air",
    parts: "Carrier",
    lookup: "Look up 24ACC636A003",
  });
});

test("a price, a size, and an unknown word are not a model or a brand", () => {
  const hvac = resolveEquipment(
    { systemType: "my unit thing", equipmentBrand: "around four thousand", equipmentModel: "$4,500" },
    "HVAC",
  );
  assert.deepEqual(hvac, {});
  const sized = resolveEquipment({ systemType: "water heater", equipmentBrand: "Rheem", equipmentModel: "50 gallon" }, "Plumbing");
  assert.equal(sized.systemType, "Tank water heater");
  assert.equal(sized.equipmentBrand, "Rheem");
  assert.equal(sized.equipmentModel, undefined);
  const otherTrade = resolveEquipment({ systemType: "toilet", equipmentBrand: "Kohler" }, "HVAC");
  assert.equal(otherTrade.systemType, undefined);
  assert.equal(otherTrade.equipmentBrand, undefined);
});

test("a model read next to the brand is kept, and a Federal Pacific panel changes the visit", () => {
  const withNumber = resolveEquipment({ systemType: "heat pump", equipmentBrand: "Carrier 24ACC636A003" }, "HVAC");
  assert.equal(withNumber.equipmentBrand, "Carrier");
  assert.equal(withNumber.equipmentModel, "24ACC636A003");
  const panel = resolveEquipment({ systemType: "breaker panel", equipmentBrand: "FPE" }, "Electrical");
  assert.equal(panel.systemType, "Panel");
  assert.equal(panel.equipmentBrand, "Federal Pacific");
  assert.equal(equipmentFacts(panel).parts, "Federal Pacific. Do not add breakers.");
  const tankless = extractLeadFromStructuredData(
    { systemType: "tankless", equipmentBrand: "Navien", equipmentModel: "NPE-240A" },
    "Plumbing",
  );
  assert.equal(tankless.systemType, "Tankless water heater");
  assert.equal(tankless.equipmentBrand, "Navien");
  assert.equal(tankless.equipmentModel, "NPE-240A");
});

test("the machine stays on the customer and a later call can use the model already on file", () => {
  const first = rememberEquipment(null, resolveEquipment({ systemType: "furnace", equipmentBrand: "Trane" }, "HVAC"));
  assert.match(first, /Furnace/);
  assert.match(first, /Trane/);
  const again = rememberEquipment(first, resolveEquipment({ systemType: "furnace", equipmentBrand: "Trane" }, "HVAC"));
  assert.equal(again, null);
  const withModel = rememberEquipment(
    first,
    resolveEquipment({ systemType: "furnace", equipmentBrand: "Trane", equipmentModel: "S9X2B080" }, "HVAC"),
  );
  assert.match(withModel, /S9X2B080/);
  assert.equal(modelOnFile(withModel, "Furnace"), "S9X2B080");
  assert.equal(
    equipmentFacts({ systemType: "Furnace", equipmentBrand: "Trane", onFileModel: modelOnFile(withModel, "Furnace") }).lookup,
    "On file S9X2B080",
  );
  const kept = rememberEquipment(
    withModel,
    resolveEquipment({ systemType: "furnace", equipmentBrand: "Lennox" }, "HVAC"),
  );
  assert.match(kept, /Lennox/);
  assert.match(kept, /S9X2/);
});
