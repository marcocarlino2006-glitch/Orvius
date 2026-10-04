/*
 * The voice sim runs the production receptionist, tools included (docs/BACKLOG.md
 * M4). Its tools answer from a sandbox with the production reply text and no
 * database, and each scenario says which tools a good call has to use.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { answerVoiceSimToolCalls, voiceSimSecretMatches, voiceSimToolSecret } = await import("../src/lib/voice-sim-tools.ts");
const { BAD_SLOT_REPLY } = await import("../src/lib/in-call-tool-defs.ts");
const { gradeScenario, scenarios } = await import("./voice-scenarios.mjs");

const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
// Friday Sep 25 2026, 10:00 AM in Chicago.
const now = new Date("2026-09-25T15:00:00Z");
const ask = (name, args, options = {}) => answerVoiceSimToolCalls([{ id: "t", name, args }], { now, ...options })[0].result;

test("the sandbox offers real open times and holds one the caller picks, in production's words", () => {
  const offer = ask("check_availability", { serviceType: "furnace tune-up", preference: "next week mornings" });
  assert.match(offer, /^(Nothing is open.*)?Open times, shop local time: /);
  const slot = offer.match(/\[slot ([^\]]+)\]/)?.[1];
  assert.ok(slot, offer);
  assert.match(ask("hold_appointment", { slot, serviceType: "furnace tune-up" }), /^Held .*penciled in/);
  assert.equal(ask("hold_appointment", { slot: "tuesday-ish" }), BAD_SLOT_REPLY);
  assert.match(ask("hold_appointment", { slot: "2026-09-27T03:00:00.000Z" }), /just taken/, "a Sunday 10pm slot is outside shop hours");
});

test("the sandbox refuses to book a danger call and answers the alert the way production does", () => {
  assert.match(ask("check_availability", { serviceType: "I smell gas by the furnace" }), /^Do not book this\..*alert_team_now/);
  assert.match(ask("alert_team_now", { hazard: "gas smell" }), /call you right back/);
  assert.match(ask("alert_team_now", { hazard: "gas smell" }, { transferring: true }), /use the transfer tool/);
});

test("the sandbox answers only a caller holding the Vapi key", async () => {
  const key = "vapi-test-key";
  assert.equal(voiceSimSecretMatches(voiceSimToolSecret(key), key), true);
  assert.equal(voiceSimSecretMatches(voiceSimToolSecret("other"), key), false);
  assert.equal(voiceSimSecretMatches(null, key), false);
  assert.equal(voiceSimSecretMatches(voiceSimToolSecret(key), undefined), false, "no key on the server, no sandbox");

  process.env.VAPI_API_KEY = key;
  const { POST } = await import("../src/app/api/webhooks/voice-sim-tools/route.ts");
  const body = JSON.stringify({
    message: { type: "tool-calls", toolCallList: [{ id: "a1", function: { name: "alert_team_now", arguments: { hazard: "CO alarm" } } }] },
  });
  const refused = await POST(new Request("https://app.test/api/webhooks/voice-sim-tools", { method: "POST", body, headers: { "x-vapi-secret": "nope" } }));
  assert.equal(refused.status, 404);
  const ok = await POST(
    new Request("https://app.test/api/webhooks/voice-sim-tools?transfer=1", {
      method: "POST",
      body,
      headers: { "x-vapi-secret": voiceSimToolSecret(key) },
    }),
  );
  const { results } = await ok.json();
  assert.equal(results[0].toolCallId, "a1");
  assert.match(results[0].result, /use the transfer tool/);
  delete process.env.VAPI_API_KEY;
});

test("a danger call that never alerts the team fails the gate, and one that books fails too", () => {
  const ai = "Please leave the home now, don't touch any switches, and call the gas company or 911 from outside.";
  const ctx = (tools) => ({ ai, structured: {}, durationSec: 60, call: { analysis: { summary: "" } }, prompt: "", tools });
  assert.deepEqual(gradeScenario(byId["gas-smell"], ctx(["alert_team_now"])), []);
  assert.deepEqual(gradeScenario(byId["gas-smell"], ctx([])), ["never called alert_team_now"]);
  assert.deepEqual(gradeScenario(byId["gas-smell"], ctx(["alert_team_now", "hold_appointment"])), [
    "called hold_appointment, which this call must not",
  ]);
  assert.deepEqual(gradeScenario(byId["gas-smell"], ctx(undefined)), [], "no tool log, no tool checks");
  assert.ok(byId["gas-smell"].gate && byId["co-alarm"].tools && byId["spanish-gas"].tools && byId["smoke-from-unit"].tools);
});

test("a routine call has to check the schedule and hold a time", () => {
  const structured = { phone: "+13125550170", address: "1320 Elmwood Avenue", urgency: "flexible" };
  const ctx = (tools) => ({ ai: "Got it.", structured, durationSec: 90, call: { analysis: { summary: "" } }, prompt: "", tools });
  assert.deepEqual(gradeScenario(byId["maintenance-booking"], ctx(["check_availability", "hold_appointment"])), []);
  assert.deepEqual(gradeScenario(byId["maintenance-booking"], ctx(["check_availability"])), ["never called hold_appointment"]);
});

test("the sim builds the receptionist the way shops get it: booking tools on, transfer when a number is given", () => {
  const source = readFileSync(new URL("./voice-sim.mjs", import.meta.url), "utf8");
  assert.match(source, /inCallBooking: true/);
  assert.match(source, /canBook: true/);
  assert.match(source, /\/api\/webhooks\/voice-sim-tools/);
  assert.match(source, /webhookSecret: voiceSimToolSecret\(KEY\)/);
  assert.match(source, /gradeScenario\(s, \{/);
  assert.match(source, /delete config\.serverUrl;/, "call reports still go nowhere");
});
