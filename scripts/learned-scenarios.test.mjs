#!/usr/bin/env node
/*
 * Real calls that went wrong become voice-sim scenarios without carrying any
 * of the caller's words or details, and their graders catch the same failure.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { gradeCall } from "../src/lib/call-quality.ts";
import { gradeLearned, learnScenario, learnScenarios, syntheticCaller } from "../src/lib/learned-scenarios.ts";
import { hydrateLearned } from "./voice-scenarios.mjs";

const shop = { trade: "HVAC", servicesJson: "[]", name: "Summit Heating" };

function realCall(id, { transcript, lead, summary = null, status = "ended", durationSec = 120 }) {
  const call = { status, durationSec, transcript, summary, booked: false };
  return { id, transcript, summary, lead, business: shop, grade: gradeCall({ call, lead, business: shop }) };
}

const gasNoGuidance = () =>
  realCall("call_gas_1", {
    transcript: [
      "AI: Thank you for calling Summit Heating. How can I help?",
      "User: My furnace won't start and I smell gas in the basement. I'm Rebecca Stone at 55 Maple Lane.",
      "AI: Got it. What's the best number to reach you?",
      "User: 847-555-2211.",
      "AI: Thanks, the team will call you back.",
    ].join("\n"),
    summary: "Caller Rebecca Stone reported a furnace not starting and a gas smell at 55 Maple Lane.",
    lead: { name: "Rebecca Stone", phone: "8475552211", address: "55 Maple Lane", serviceType: "furnace not starting, smells gas", urgency: "same-day", notes: null },
  });

test("a hazard the receptionist fumbled becomes a scenario that demands safety steps and a live alert", () => {
  const s = learnScenario(gasNoGuidance());
  assert.ok(s);
  assert.match(s.id, /^learned-[0-9a-f]{8}$/);
  assert.equal(s.gate, false);
  assert.equal(s.learnedFrom.hazard, "gas_smell");
  assert.ok(s.learnedFrom.findings.includes("safety_no_guidance"));
  assert.match(s.persona, /smell gas/);
  assert.deepEqual(s.tools, { must: ["alert_team_now"], never: ["hold_appointment"] });
  assert.ok(s.checks.some((c) => c.kind === "safety_guidance"));
  assert.ok(s.checks.some((c) => c.kind === "urgency" && c.allowed.includes("emergency")));
});

test("nothing the real caller said or gave survives into the scenario", () => {
  const text = JSON.stringify(learnScenario(gasNoGuidance()));
  for (const leaked of ["Rebecca", "Stone", "Maple", "2211", "847", "basement", "Summit"]) {
    assert.ok(!text.includes(leaked), `scenario leaked "${leaked}"`);
  }
  const who = syntheticCaller("call_gas_1");
  assert.ok(text.includes(who.number));
  assert.deepEqual(syntheticCaller("call_gas_1"), who, "the same call always gets the same synthetic caller");
  assert.notEqual(syntheticCaller("call_gas_2").digits, who.digits);
});

test("calls with nothing a scripted caller can reproduce are not learned", () => {
  const clean = realCall("call_clean", {
    transcript: "AI: Thanks for calling.\nUser: AC is out.\nAI: Got it.",
    lead: { name: "A B", phone: "3125550100", address: "1 Main St", serviceType: "AC not cooling", urgency: "same-day" },
  });
  const dropped = realCall("call_failed", { transcript: "", status: "failed", durationSec: 0, lead: null });
  assert.equal(learnScenario({ ...clean, grade: { ...clean.grade, findings: [] } }), null);
  assert.equal(learnScenario(dropped), null);
});

test("many calls failing the same way become one scenario, the worst failures first", () => {
  const calls = ["a", "b", "c"].map((n) => ({ ...gasNoGuidance(), id: `call_gas_${n}` }));
  const repeated = realCall("call_repeat", {
    transcript: [
      "AI: What's the address?",
      "User: I already told you, 12 Oak Street.",
      "AI: What's the address?",
    ].join("\n"),
    lead: { name: "Z Y", phone: "3125550101", address: "12 Oak Street", serviceType: "AC not cooling", urgency: "this-week" },
  });
  const out = learnScenarios([repeated, ...calls], 10);
  assert.equal(out.length, 2);
  assert.equal(out[0].learnedFrom.hazard, "gas_smell");
  assert.ok(out[1].checks.some((c) => c.kind === "no_repeated_question"));
  assert.equal(learnScenarios([repeated, ...calls], 1).length, 1);
});

test("a Spanish caller's failure is replayed in Spanish", () => {
  const es = realCall("call_es", {
    transcript: [
      "AI: Thank you for calling. How can I help?",
      "User: Hola, necesito ayuda, no funciona la calefacción.",
      "AI: Sorry, can you repeat that? What is your address? And your name?",
      "User: Por favor, en español. Mi casa está fría.",
    ].join("\n"),
    lead: { name: null, phone: null, address: null, serviceType: "no heat", urgency: "emergency" },
  });
  const s = learnScenario(es);
  assert.equal(s.lang, "es");
  assert.match(s.persona, /ONLY Spanish/);
});

test("learned graders pass a good call and name each failure on a bad one", () => {
  const s = learnScenario(gasNoGuidance());
  const who = syntheticCaller("call_gas_1");
  const good = {
    ai: "Please leave the home now, don't touch any switches, and call the gas company or 911 from outside.\nGot it. What's your number?",
    structured: { phone: who.digits, address: who.address, name: who.name, urgency: "emergency" },
  };
  assert.deepEqual(gradeLearned(s.checks, good), []);
  const bad = gradeLearned(s.checks, { ai: "Got it. A tech will be there within the hour.", structured: { phone: "3125550000", urgency: "same-day" } });
  assert.ok(bad.some((f) => /safety instruction/.test(f)));
  assert.ok(bad.some((f) => /callback number/.test(f)));
  assert.ok(bad.some((f) => /urgency/.test(f)));
  assert.ok(bad.some((f) => /promised/.test(f)));

  assert.deepEqual(gradeLearned([{ kind: "one_question_per_turn" }], { ai: "What's your name? And your address please?", structured: {} }).length, 1);
  assert.deepEqual(gradeLearned([{ kind: "short_replies", maxWords: 5 }], { ai: "one two three four five six seven", structured: {} }).length, 1);
  assert.deepEqual(gradeLearned([{ kind: "no_repeated_question" }], { ai: "What is the service address?\nWhat is the service address?", structured: {} }).length, 1);
});

test("the simulator accepts learned scenarios only in their own shape, and never as a release gate", () => {
  const spec = JSON.parse(JSON.stringify(learnScenario(gasNoGuidance())));
  const s = hydrateLearned({ ...spec, gate: true });
  assert.equal(s.gate, false);
  assert.equal(typeof s.grade, "function");
  assert.notDeepEqual(s.grade({ ai: "Okay.", structured: {} }), []);
  assert.throws(() => hydrateLearned({ id: "gas-smell", persona: "x", checks: [] }), /not a learned scenario/);
  assert.throws(() => hydrateLearned({ id: "learned-1234abcd", persona: "x" }), /not a learned scenario/);
});
