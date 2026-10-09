/*
 * Every launched trade is call-tested, not just HVAC: the voice sim answers as
 * that trade's shop, with that trade's hazards, routine booking and work it
 * does not cover, and the nightly and gate runs go through all of them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { scenarios, gradeScenario } = await import("./voice-scenarios.mjs");
const { answerVoiceSimToolCalls, VOICE_SIM_SHOPS, voiceSimShop } = await import("../src/lib/voice-sim-tools.ts");
const { LAUNCH_TRADES } = await import("../src/lib/trades.ts");

const now = new Date("2026-10-05T14:00:00Z");
const ask = (trade, name, args) => answerVoiceSimToolCalls([{ id: "t", name, args }], { now, trade })[0].result;
const forTrade = (trade) => scenarios.filter((s) => (s.trade ?? "HVAC") === trade);

test("every launched trade has its own demo shop and call scenarios", () => {
  assert.deepEqual(Object.keys(VOICE_SIM_SHOPS).sort(), [...LAUNCH_TRADES].sort());
  for (const trade of LAUNCH_TRADES) {
    const list = forTrade(trade);
    assert.ok(list.length >= 6, `${trade} has scenarios`);
    assert.ok(list.some((s) => s.gate && s.tools?.must?.includes("alert_team_now")), `${trade} gates on a hazard call`);
    assert.ok(list.some((s) => s.tools?.must?.includes("hold_appointment")), `${trade} books a routine call`);
    assert.ok(
      list.some((s) => s.tools?.never?.includes("hold_appointment") && /not covered|rooftop|restaurant/i.test(s.name)),
      `${trade} has work it doesn't cover`,
    );
  }
  assert.equal(voiceSimShop("Plumbing").name, "Summit Plumbing");
  assert.equal(voiceSimShop(null).trade, "HVAC");
});

test("the sim's tools answer as the trade's shop: scope, hazards and booking", () => {
  assert.match(ask("Plumbing", "check_availability", { serviceType: "septic tank pumping" }), /^Do not book this\. Well pumps and septic/);
  assert.match(ask("Plumbing", "hold_appointment", { serviceType: "septic", slot: "2026-10-07T15:00:00Z" }), /^Do not book this/);
  assert.match(ask("Plumbing", "check_availability", { serviceType: "slow kitchen drain" }), /Open times/);
  assert.match(ask("Plumbing", "check_availability", { serviceType: "smells like gas by the water heater" }), /Call alert_team_now/);
  assert.match(ask("Electrical", "check_availability", { serviceType: "solar panel install" }), /Solar panels and home batteries/);
  assert.match(ask("Electrical", "check_availability", { serviceType: "breaker keeps tripping" }), /Open times/);
  assert.match(ask("HVAC", "check_availability", { serviceType: "walk-in cooler at my restaurant" }), /Commercial equipment/);
});

test("out-of-scope graders pass a callback and fail a booking", () => {
  const septic = scenarios.find((s) => s.id === "plumb-septic");
  const structured = { phone: "312-555-0195" };
  assert.deepEqual(gradeScenario(septic, { ai: "Thanks Gail. I'll have the owner call you back about the septic pumping.", structured, tools: [] }), []);
  const booked = gradeScenario(septic, { ai: "We can come Tuesday at 9.", structured, tools: ["check_availability", "hold_appointment"] });
  assert.ok(booked.includes("never said the owner would call back"));
  assert.ok(booked.includes("called hold_appointment, which this call must not"));
  const solar = scenarios.find((s) => s.id === "elec-solar");
  assert.ok(gradeScenario(solar, { ai: "A system like that is about $15,000. The owner will call you back.", structured: { phone: "3125550200" }, tools: [] }).some((f) => /quoted a price/.test(f)));
});

test("the sim runs a trade's shop and scenarios, and CI runs every trade", () => {
  const sim = readFileSync("scripts/voice-sim.mjs", "utf8");
  assert.match(sim, /voice-sim-tools\?trade=\$\{encodeURIComponent\(trade\)\}/);
  assert.match(sim, /\(s\.trade \?\? "HVAC"\) === trade/);
  for (const file of [".github/workflows/voice-nightly.yml", ".github/workflows/voice-gate.yml"]) {
    const yml = readFileSync(file, "utf8");
    for (const trade of LAUNCH_TRADES) assert.match(yml, new RegExp(`\\b${trade}\\b`), `${file} runs ${trade}`);
  }
  assert.match(readFileSync("src/app/api/webhooks/voice-sim-tools/route.ts", "utf8"), /trade: params\.get\("trade"\)/);
});
