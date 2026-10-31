#!/usr/bin/env node
/*
 * A caller speaking Spanish hears the open times and "you're booked" in
 * Spanish words the schedule wrote, not the model's translation; the shop can
 * greet in both languages with one switch.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { describeSlotSpanish, availabilityReply, heldReply, heldNewTimeReply } = await import("../src/lib/in-call-tool-defs.ts");
const { callerSpeakingSpanish } = await import("../src/lib/caller-language.ts");
const { answerVoiceSimToolCalls } = await import("../src/lib/voice-sim-tools.ts");
const { SPANISH_LINE, hasSpanishLine, withSpanishLine } = await import("../src/lib/greeting-lines.ts");
const { openingWithNotice } = await import("../src/lib/vapi.ts");

const tz = "America/Chicago";

test("times read the way a Spanish speaker says them", () => {
  assert.equal(describeSlotSpanish(new Date("2026-10-29T20:00:00Z"), tz), "el jueves 29 de octubre a las 3 de la tarde");
  assert.equal(describeSlotSpanish(new Date("2026-10-30T13:30:00Z"), tz), "el viernes 30 de octubre a las 8 y media de la mañana");
  assert.equal(describeSlotSpanish(new Date("2026-11-02T18:00:00Z"), tz), "el lunes 2 de noviembre a las 12 del mediodía");
  assert.equal(describeSlotSpanish(new Date("2026-11-02T19:15:00Z"), tz), "el lunes 2 de noviembre a la 1 y cuarto de la tarde");
});

test("only the caller's recent words decide the language", () => {
  assert.equal(callerSpeakingSpanish("Hola, mi aire acondicionado no funciona \n Sí, el jueves está bien"), true);
  assert.equal(callerSpeakingSpanish("My AC stopped cooling \n Thursday works for me"), false);
  assert.equal(callerSpeakingSpanish("Hi my furnace is out \n Perdón, ¿habla español? \n Sí, necesito una cita para mañana"), true, "switched mid-call");
  assert.equal(callerSpeakingSpanish("Yes \n ok"), false, "one-word replies decide nothing");
  assert.equal(callerSpeakingSpanish(null), false);
  assert.equal(callerSpeakingSpanish("I live on Calle Ocho, in the casa by the park"), false, "a Spanish street name is not a Spanish speaker");
});

test("Spanish callers get Spanish wording in every booking reply; English callers get none", () => {
  const at = new Date("2026-10-29T20:00:00Z");
  const offered = availabilityReply([at], tz, "", true);
  assert.match(offered, /\(en español: el jueves 29 de octubre a las 3 de la tarde\) \[slot 2026-10-29T20:00:00\.000Z\]/);
  assert.match(offered, /say the times in Spanish exactly as written/);
  assert.doesNotMatch(availabilityReply([at], tz), /español/);
  assert.match(heldReply(at, tz, true), /tell them "Ya está reservado para el jueves 29 de octubre a las 3 de la tarde\."/);
  assert.match(heldReply(at, tz), /tell them "You're booked for Thursday, October 29 at 3:00 PM\."/);
  assert.match(heldNewTimeReply(at, tz, true), /"Su visita queda cambiada para el jueves 29 de octubre a las 3 de la tarde\."/);
});

test("the preview call answers a Spanish caller in Spanish too", () => {
  const now = new Date("2026-09-25T14:00:00Z");
  const callerWords = "Hola, mi calefacción no funciona \n Necesito a alguien esta semana por favor";
  const [offer] = answerVoiceSimToolCalls([{ id: "c", name: "check_availability", args: { serviceType: "furnace tune-up" } }], { now, callerWords });
  assert.match(offer.result, /en español: el /);
  const slot = offer.result.match(/\[slot ([^\]]+)\]/)[1];
  const [held] = answerVoiceSimToolCalls(
    [{ id: "h", name: "hold_appointment", args: { slot, serviceType: "furnace tune-up", callerName: "María López", address: "12 Elm St, Springfield" } }],
    { now, callerWords },
  );
  assert.match(held.result, /Ya está reservado para el /);
});

test("one switch adds the Spanish line before the closing question, and removes it cleanly", () => {
  const on = withSpanishLine(null, "Pipe Pros", true);
  assert.equal(on, `Thank you for calling Pipe Pros. ${SPANISH_LINE} How can I help you today?`);
  assert.ok(hasSpanishLine(on));
  assert.equal(withSpanishLine(on, "Pipe Pros", true), on, "turning it on twice adds it once");
  assert.equal(withSpanishLine(on, "Pipe Pros", false), "Thank you for calling Pipe Pros. How can I help you today?");
  assert.equal(withSpanishLine("Pipe Pros, this is the front desk.", "Pipe Pros", true), `Pipe Pros, this is the front desk. ${SPANISH_LINE}`);
  const spoken = openingWithNotice(on, "Pipe Pros");
  assert.match(spoken, /Para español, hable en español\. This call may be recorded .* How can I help you today\?$/, "the notice still comes before the question");
});
