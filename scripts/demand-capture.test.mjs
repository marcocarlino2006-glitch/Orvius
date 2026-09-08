import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMAND_CATEGORIES,
  DEMAND_CATEGORY_CODES,
  classifyDemand,
  demandCategoryLabel,
  isDemandCategoryCode,
} from "../src/lib/job-taxonomy.ts";
import { extractPostalCode, postalSector } from "../src/lib/service-area.ts";
import { deriveDemandSignal } from "../src/lib/demand-capture.ts";

/* ── Codes are a permanent join key ── */

test("category codes are unique and stably shaped", () => {
  const seen = new Set(DEMAND_CATEGORY_CODES);
  assert.equal(
    seen.size,
    DEMAND_CATEGORY_CODES.length,
    "a duplicated code silently merges two categories",
  );

  for (const code of DEMAND_CATEGORY_CODES) {
    assert.match(
      code,
      /^[a-z]+\.[a-z0-9_]+$/,
      `${code} must stay trade.category and lowercase — these are stored forever`,
    );
    assert.ok(demandCategoryLabel(code), `${code} needs an owner-facing label`);
  }
});

test("every category has patterns that can actually match", () => {
  for (const category of DEMAND_CATEGORIES) {
    assert.ok(
      category.patterns.length > 0,
      `${category.code} can never be assigned without patterns`,
    );
  }
});

test("unknown codes are rejected rather than stored", () => {
  assert.equal(isDemandCategoryCode("hvac.no_cool"), true);
  assert.equal(isDemandCategoryCode("hvac.made_up"), false);
  assert.equal(isDemandCategoryCode(""), false);
  assert.equal(isDemandCategoryCode(null), false);
});

/* ── Real phrasings from real calls ── */

test("classifies the way callers actually talk", () => {
  const cases = [
    // HVAC
    ["AC not cooling", "HVAC", "hvac.no_cool"],
    ["ac is out and the house is hot", "HVAC", "hvac.no_cool"],
    ["blowing warm air", "HVAC", "hvac.no_cool"],
    ["no heat upstairs", "HVAC", "hvac.no_heat"],
    ["furnace not turning on", "HVAC", "hvac.no_heat"],
    ["want a quote on a system replacement", "HVAC", "hvac.system_replace"],
    ["annual maintenance tune-up", "HVAC", "hvac.maintenance"],
    ["thermostat is blank", "HVAC", "hvac.thermostat"],
    // Plumbing
    ["water heater is leaking", "Plumbing", "plumb.water_heater"],
    ["no hot water", "Plumbing", "plumb.water_heater"],
    ["kitchen sink is clogged", "Plumbing", "plumb.drain_clog"],
    ["sewer is backing up into the shower", "Plumbing", "plumb.sewer"],
    ["toilet keeps running", "Plumbing", "plumb.toilet"],
    ["burst pipe, water everywhere", "Plumbing", "plumb.leak"],
    ["I smell gas near the meter", "Plumbing", "plumb.gas"],
    // Electrical
    ["breaker keeps tripping", "Electrical", "elec.breaker"],
    ["half the house has no power", "Electrical", "elec.outage"],
    ["need a panel upgrade to 200 amp", "Electrical", "elec.panel"],
    ["install an EV charger in the garage", "Electrical", "elec.ev_charger"],
    ["burning smell from the outlet", "Electrical", "elec.hazard"],
    ["lights keep flickering", "Electrical", "elec.lighting"],
  ];

  for (const [text, trade, expected] of cases) {
    assert.equal(
      classifyDemand({ text, trade }),
      expected,
      `"${text}" should classify as ${expected}`,
    );
  }
});

test("narrow categories win over the broad ones they sit inside", () => {
  // Both mention a leak; only one is a leak job.
  assert.equal(
    classifyDemand({ text: "water heater leaking in the garage", trade: "Plumbing" }),
    "plumb.water_heater",
  );
  assert.equal(
    classifyDemand({ text: "pipe leaking under the sink", trade: "Plumbing" }),
    "plumb.leak",
  );
  // Both mention the AC; a replacement quote is not an outage.
  assert.equal(
    classifyDemand({ text: "want to replace my ac unit", trade: "HVAC" }),
    "hvac.system_replace",
  );
});

test("the shop's trade decides ambiguous words", () => {
  // "Leak" is a pipe to a plumber and a condensate pan to an HVAC shop.
  assert.equal(
    classifyDemand({ text: "unit is leaking water", trade: "HVAC" }),
    "hvac.condensate",
  );
  assert.equal(
    classifyDemand({ text: "leaking under the sink", trade: "Plumbing" }),
    "plumb.leak",
  );
});

test("out-of-trade calls are still recorded, not discarded", () => {
  // A plumber's line takes an electrical call; that demand is real.
  assert.equal(
    classifyDemand({ text: "breaker keeps tripping", trade: "Plumbing" }),
    "elec.breaker",
  );
});

test("noise never scores a trade category", () => {
  for (const text of [
    "wrong number sorry",
    "calling about your furnace advertising options",
    "I have a resume to send, are you hiring",
  ]) {
    assert.equal(
      classifyDemand({ text, trade: "HVAC" }),
      "other.non_service",
      `"${text}" must not become billable demand`,
    );
  }
});

test("nothing recognisable stays null instead of guessing", () => {
  for (const text of ["", "   ", "hello", "call me back", null, undefined]) {
    assert.equal(
      classifyDemand({ text, trade: "HVAC" }),
      null,
      "a wrong code poisons a benchmark; an empty one can be revisited",
    );
  }
});

/* ── Service area ── */

test("pulls the ZIP out of addresses as spoken", () => {
  const cases = [
    ["123 Main St, Austin, TX 78701", "78701"],
    ["4820 Oak Ridge Dr Apt 12, Phoenix AZ 85032", "85032"],
    ["78701", "78701"],
    ["Austin TX 78701-1234", "78701"],
    ["  90210  ", "90210"],
  ];
  for (const [address, expected] of cases) {
    assert.equal(extractPostalCode(address), expected, `from "${address}"`);
  }
});

test("never mistakes a street number for a ZIP", () => {
  for (const address of [
    "12345 Elm Street",
    "10001 Broadway Apt 4",
    "no address given",
    "call for address",
    "555-123-4567",
    "",
    null,
  ]) {
    assert.equal(
      extractPostalCode(address),
      null,
      `"${address}" would file a whole city under a house number`,
    );
  }
});

test("rejects five-digit runs outside the allocated ZIP range", () => {
  assert.equal(extractPostalCode("Unit 00000, somewhere"), null);
  assert.equal(extractPostalCode("Order 99999 pickup"), null);
});

test("sector groups ZIPs when one ZIP is too thin to quote", () => {
  assert.equal(postalSector("78701"), "787");
  assert.equal(postalSector("bad"), null);
  assert.equal(postalSector(null), null);
});

/* ── The single capture path ── */

test("the agent's own pick beats any text guess", () => {
  const signal = deriveDemandSignal({
    // Text says replacement; the agent heard the caller say otherwise.
    serviceType: "replace my ac unit",
    categoryHint: "hvac.no_cool",
    address: "12 Oak, Austin TX 78704",
    trade: "HVAC",
  });
  assert.equal(signal.categoryCode, "hvac.no_cool");
  assert.equal(signal.postalCode, "78704");
});

test("a junk hint from the agent falls back to the text", () => {
  const signal = deriveDemandSignal({
    serviceType: "AC not cooling",
    categoryHint: "hvac.not_a_real_code",
    trade: "HVAC",
  });
  assert.equal(signal.categoryCode, "hvac.no_cool");
});

test("texts classify from the body, since serviceType says nothing", () => {
  const signal = deriveDemandSignal({
    serviceType: "SMS inquiry",
    notes: "hi, my water heater is leaking all over the floor at 9 Elm, 78702",
    trade: "Plumbing",
  });
  assert.equal(signal.categoryCode, "plumb.water_heater");
  assert.equal(signal.postalCode, "78702");
});

test("the short field is read before the transcript drowns it", () => {
  const signal = deriveDemandSignal({
    serviceType: "AC not cooling",
    // A summary full of other trade words must not outvote the request.
    summary:
      "Caller mentioned a toilet, a breaker, and a water heater in passing.",
    trade: "HVAC",
  });
  assert.equal(signal.categoryCode, "hvac.no_cool");
});

/* ── What the capture buys ── */

test("captured rows aggregate into a benchmark; free text cannot", () => {
  // Four ways one job gets described on four different calls.
  const spellings = [
    "AC not cooling",
    "ac is out",
    "air conditioner not working",
    "blowing warm air",
  ];

  const byFreeText = new Set(spellings);
  const byCode = new Set(
    spellings.map((text) => classifyDemand({ text, trade: "HVAC" })),
  );

  assert.equal(byFreeText.size, 4, "free text splits one job four ways");
  assert.equal(byCode.size, 1, "codes collapse them into one countable job");
  assert.equal([...byCode][0], "hvac.no_cool");
});
