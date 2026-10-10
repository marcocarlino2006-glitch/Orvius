import assert from "node:assert/strict";
import test from "node:test";

const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
const { deriveDemandSignal } = await import("../src/lib/demand-capture.ts");
const { outsideScope, tradeScope } = await import("../src/lib/trade-scope.ts");

/**
 * How homeowners actually describe each job a launched trade books. Each one
 * must reach the workflow's service (what the calendar books) and category
 * (what the job record says), and must not be refused as out of scope.
 */
const PHRASINGS = {
  HVAC: {
    no_cooling: [
      "ac isn't cooling",
      "air conditioner is blowing hot air",
      "my central air stopped working",
      "the house won't cool down",
      "ac running nonstop but still warm inside",
      "a/c quit on us last night",
      "the AC unit outside isn't turning on",
      "it's 88 degrees in here the air isn't working",
      "heat pump not cooling",
      "upstairs ac not keeping up",
      "air conditioning went out",
      "the ac is blowing warm",
      "ac stopped working yesterday",
      "my AC won't turn on",
      "no cold air coming out of the vents",
      "the air conditioner is making the house hot",
      "ac is running but not cooling the house",
    ],
    no_heat: [
      "furnace isn't working",
      "no heat in the house",
      "heater won't turn on",
      "furnace keeps shutting off",
      "heat pump isn't heating",
      "boiler stopped working",
      "radiators are cold",
      "the heat isn't coming on",
      "furnace blowing cold air",
      "pilot light keeps going out on the furnace",
      "my heat stopped working",
      "furnace won't ignite",
      "it's freezing and the heater isn't working",
      "heat pump won't heat",
      "boiler is making noise and no heat",
    ],
    tune_up: [
      "need a tune up",
      "want to schedule annual maintenance",
      "seasonal checkup for my ac",
      "furnace maintenance before winter",
      "can someone service my system",
      "routine maintenance on my heat pump",
      "time for my yearly ac tune-up",
      "i'd like a maintenance visit",
      "need my furnace checked before winter, it's working fine",
    ],
    thermostat: [
      "thermostat isn't working",
      "my nest thermostat is blank",
      "thermostat won't change temperature",
      "need a new thermostat installed",
      "thermostat screen is dead",
      "want a smart thermostat installed",
    ],
    system_estimate: [
      "want a quote for a new ac",
      "looking to replace my furnace",
      "estimate on a new hvac system",
      "how much for a new heat pump",
      "our system is old want to replace it",
      "i need a quote to replace my ac",
      "thinking about a new system",
      "how much does a new furnace cost",
      "want an estimate for a mini split",
    ],
  },
  Plumbing: {
    leak: [
      "pipe is leaking",
      "water leaking from the ceiling",
      "burst pipe",
      "leak under the sink",
      "water coming through the wall",
      "pipe broke in the basement",
      "my basement is flooding",
      "dripping pipe in the garage",
      "there's a leak in my ceiling",
      "water pipe burst under the house",
      "pipe under the sink is dripping",
      "water leaking through the light fixture downstairs",
    ],
    drain_clog: [
      "kitchen sink is clogged",
      "bathtub won't drain",
      "shower drain backed up",
      "slow draining sink",
      "drain is clogged",
      "garbage disposal is clogged and sink won't drain",
      "the bathroom sink drains really slow",
      "my tub is backed up",
      "need a drain snaked",
      "kitchen drain clogged again",
    ],
    water_heater: [
      "no hot water",
      "water heater is leaking",
      "hot water heater stopped working",
      "tankless water heater error",
      "only lukewarm water",
      "need a new water heater",
      "hot water runs out fast",
      "the water heater is making popping noises",
      "no hot water this morning",
    ],
    toilet: [
      "toilet is clogged",
      "toilet keeps running",
      "toilet won't flush",
      "toilet leaking at the base",
      "need a toilet replaced",
      "toilet keeps overflowing",
      "toilet is running all night",
      "toilet flapper broken",
    ],
    fixture: [
      "faucet is dripping",
      "need a new kitchen faucet installed",
      "shower head leaking",
      "garbage disposal stopped working",
      "bathroom sink faucet broken",
      "kitchen faucet drips nonstop",
      "want to replace my bathroom faucet",
      "disposal is humming but not spinning",
    ],
    sewer: [
      "sewer line is backed up",
      "main line clog",
      "sewer smell in the yard",
      "need a sewer camera inspection",
      "tree roots in the sewer line",
      "sewage smell in the basement",
      "main sewer line keeps backing up",
      "camera inspection of the sewer",
    ],
  },
  Electrical: {
    power_loss: [
      "half my house has no power",
      "lost power in the kitchen",
      "no power to the garage",
      "power went out in two rooms",
      "the power is out on one side of the house",
      "the power went out in half the house",
      "lost power to the bedrooms",
      "no power in the kitchen but the rest works",
    ],
    breaker: [
      "breaker keeps tripping",
      "circuit breaker won't reset",
      "breaker trips when i run the microwave",
      "a fuse keeps blowing",
      "gfci keeps tripping in the bathroom",
      "my breaker trips every night",
      "breaker won't stay on",
      "fuse blew again",
    ],
    outlet: [
      "outlet isn't working",
      "dead outlets in the living room",
      "need more outlets",
      "light switch stopped working",
      "outlet is loose",
      "need a gfci outlet installed",
      "outlets in the bedroom don't work",
      "switch is broken",
      "want to add an outlet in the garage",
      "replace outlets with usb outlets",
    ],
    lighting: [
      "lights keep flickering",
      "need recessed lights installed",
      "ceiling fan installation",
      "light fixture not working",
      "want to install outdoor lighting",
      "chandelier install",
      "lights flicker when the ac comes on",
      "install can lights in the kitchen",
      "hang a ceiling fan",
    ],
    panel_ev: [
      "need a panel upgrade",
      "upgrade to 200 amp service",
      "install an ev charger",
      "tesla charger install",
      "electrical panel replacement",
      "need a level 2 charger in the garage",
      "panel is old and needs replacing",
      "need an ev charger installed in my garage",
      "upgrade my electrical service to 200 amps",
    ],
  },
};

for (const [trade, workflows] of Object.entries(PHRASINGS)) {
  test(`${trade}: everyday phrasings book the right job`, () => {
    const scope = tradeScope(trade);
    const misses = [];
    for (const [key, phrases] of Object.entries(workflows)) {
      const workflow = scope.workflows.find((w) => w.key === key);
      assert.ok(workflow, `${trade} has workflow ${key}`);
      for (const says of phrases) {
        const booked = classifyRequest({ business: { trade }, serviceType: says });
        const category = deriveDemandSignal({ serviceType: says, trade }).categoryCode;
        const refused = outsideScope(trade, says);
        if (!workflow.services.includes(booked.service.key)) misses.push(`"${says}" booked as ${booked.service.key}`);
        if (!workflow.categories.includes(category ?? "")) misses.push(`"${says}" recorded as ${category}`);
        if (refused) misses.push(`"${says}" refused as ${refused.key}`);
      }
    }
    assert.deepEqual(misses, []);
  });
}

test("the booked service and the job record never disagree", () => {
  const booked = classifyRequest({ business: { trade: "Plumbing" }, serviceType: "water heater is leaking" });
  assert.equal(booked.service.key, "water_heater");
  assert.equal(deriveDemandSignal({ serviceType: "water heater is leaking", trade: "Plumbing" }).categoryCode, "plumb.water_heater");
});

test("'addition' only means construction when it is a building addition", () => {
  assert.equal(outsideScope("HVAC", "in addition, the ac is not cooling"), null);
  assert.equal(outsideScope("HVAC", "we're building an addition and need ductwork")?.key, "new_construction");
  assert.equal(outsideScope("Electrical", "wiring for a room addition")?.key, "new_construction");
});

test("a request that mentions uncovered work goes to the owner, even beside covered work", () => {
  // Deliberately conservative: a solar inverter can trip the breaker, and the
  // owner decides whether that is their job. The caller gets a callback.
  assert.equal(outsideScope("Electrical", "I have solar panels and my breaker keeps tripping")?.key, "solar");
  assert.equal(outsideScope("Plumbing", "the well is fine but my faucet drips"), null);
});
