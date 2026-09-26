#!/usr/bin/env node
/*
 * The receptionist acting while the caller is on the line: offering real
 * open times, holding the one they pick, and recognising a returning caller
 * without exposing their details to whoever picked up the phone.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { findAvailableSchedules } from "../src/lib/availability.ts";
import { buildInCallTools, describeSlot, parseSlotPreference, readToolCalls } from "../src/lib/in-call-tool-defs.ts";
import { buildCallerContextNote } from "../src/lib/caller-context.ts";
import { buildAssistantSystemPrompt } from "../src/lib/business.ts";
import { assistantConfigFingerprint, buildVapiAssistantConfig } from "../src/lib/vapi.ts";
import { ownerAlertContextLine } from "../src/lib/owner-alert-message.ts";
import { DEFAULT_VOICE_ID, RECEPTIONIST_VOICES, resolveVoiceId } from "../src/lib/voices.ts";

const NY = "America/New_York";
// Friday Sep 25 2026, 10:00 AM in New York.
const now = new Date("2026-09-25T14:00:00Z");
const base = { now, hoursJson: "{}", timezone: NY, existing: [], capacity: 1, durationMin: 120 };

test("the caller hears real choices, spread out, not 8:00, 8:30 and 9:00", () => {
  const slots = findAvailableSchedules(base, { count: 3, minGapMin: 180 });
  assert.equal(slots.length, 3);
  for (let i = 1; i < slots.length; i++) {
    assert.ok(slots[i].getTime() - slots[i - 1].getTime() >= 180 * 60_000);
  }
  // Default fallback hours are Mon–Fri 8–5, and flexible work needs 24h lead.
  assert.match(describeSlot(slots[0], NY), /^Monday, September 28 at/);
});

test("'tomorrow morning' and 'el jueves' narrow the search", () => {
  assert.deepEqual(parseSlotPreference("tomorrow morning"), { dayOffsets: [1], part: "morning" });
  assert.deepEqual(parseSlotPreference("el jueves por la tarde"), { weekdays: ["thursday"], part: "afternoon" });
  assert.deepEqual(parseSlotPreference("Thursday or Friday"), { weekdays: ["thursday", "friday"] });
  assert.equal(parseSlotPreference(""), undefined);
  assert.equal(parseSlotPreference("whenever"), undefined);

  const thursdayPm = findAvailableSchedules(base, { count: 2, preference: parseSlotPreference("Thursday afternoon") });
  assert.ok(thursdayPm.length);
  for (const slot of thursdayPm) assert.match(describeSlot(slot, NY), /^Thursday, October 1 at (12|1|2|3):/);
});

test("a held time is checked again before it is reserved", () => {
  const [first] = findAvailableSchedules(base, { count: 1 });
  assert.deepEqual(findAvailableSchedules(base, { count: 1, onlyAt: first }), [first]);
  const taken = { ...base, existing: [{ scheduledAt: first, durationMin: 120 }] };
  assert.deepEqual(findAvailableSchedules(taken, { count: 1, onlyAt: first }), []);
  assert.deepEqual(findAvailableSchedules(base, { count: 1, onlyAt: new Date(now.getTime() - 3_600_000) }), []);
  const saturday = new Date("2026-09-26T14:00:00Z");
  assert.deepEqual(findAvailableSchedules(base, { count: 1, onlyAt: saturday }), []);
});

test("tool calls are read whether arguments arrive as an object or a string", () => {
  const calls = readToolCalls({
    toolCallList: [
      { id: "a", function: { name: "check_availability", arguments: { serviceType: "AC out" } } },
      { id: "b", function: { name: "hold_appointment", arguments: '{"slot":"2026-09-28T12:00:00.000Z"}' } },
      { id: "c", function: { name: "hold_appointment", arguments: "not json" } },
      { function: { name: "no_id" } },
    ],
  });
  assert.deepEqual(calls, [
    { id: "a", name: "check_availability", args: { serviceType: "AC out" } },
    { id: "b", name: "hold_appointment", args: { slot: "2026-09-28T12:00:00.000Z" } },
    { id: "c", name: "hold_appointment", args: {} },
  ]);
});

test("a returning caller is recognised but must confirm before details are used", () => {
  const note = buildCallerContextNote({
    name: "Maria Lopez",
    interactionCount: 3,
    timezone: NY,
    openJob: null,
    lastJob: { title: "AC not cooling", scheduledAt: new Date("2026-03-03T15:00:00Z"), status: "completed", address: "12 Oak St" },
  });
  assert.match(note, /never read this aloud/);
  assert.match(note, /"Is this Maria\?"/);
  assert.match(note, /Only use the details below after they confirm/);
  assert.match(note, /Last visit: AC not cooling on March 3, 2026/);
  assert.match(note, /Never say the address to someone who has not confirmed/);

  const open = buildCallerContextNote({
    name: null,
    interactionCount: 2,
    timezone: NY,
    lastJob: null,
    openJob: { title: "Furnace tune-up", scheduledAt: new Date("2026-09-28T13:00:00Z"), status: "scheduled", address: null },
  });
  assert.match(open, /Their name is not on file/);
  assert.match(open, /open job: Furnace tune-up on Monday, September 28 at 9:00 AM/);
  assert.doesNotMatch(open, /Nothing is booked/);
  assert.match(note, /Nothing is booked for them.*do not say you found or confirmed it/);

  assert.equal(buildCallerContextNote({ name: "New", interactionCount: 1, timezone: NY, lastJob: null, openJob: null }), null);
});

test("the receptionist books on the call and never names a time the schedule didn't give it", () => {
  const prompt = buildAssistantSystemPrompt({ name: "Sim Heating", greeting: null, hoursJson: "{}", servicesJson: "[]", canBook: true });
  assert.match(prompt, /call check_availability/);
  assert.match(prompt, /call hold_appointment/);
  assert.match(prompt, /NEVER say an appointment time that did not come from check_availability/);
  assert.match(prompt, /Never book an emergency/);
  assert.match(prompt, /Only the danger rule below tells anyone to leave the home/);
  assert.match(prompt, /urgent, not dangerous\. NEVER tell those callers to leave the home/);
  assert.match(prompt, /never read out digits the caller did not say/);
  assert.match(prompt, /never read their address or history to someone who has not confirmed/);

  const legacy = buildAssistantSystemPrompt({ name: "Sim Heating", greeting: null, hoursJson: "{}", servicesJson: "[]" });
  assert.doesNotMatch(legacy, /check_availability/);
  assert.match(legacy, /NEVER promise a specific arrival time/);
});

test("the assistant carries the booking tools, live control and the shop's voice", () => {
  const config = buildVapiAssistantConfig({
    businessName: "Sim Heating",
    greeting: "Hi",
    systemPrompt: "x",
    webhookUrl: "https://api.orvius.im/api/webhooks/vapi",
    webhookSecret: "s1",
    voiceId: RECEPTIONIST_VOICES[3].id,
    inCallBooking: true,
  });
  const names = config.model.tools.map((t) => t.function?.name ?? t.type);
  assert.deepEqual(names, ["check_availability", "hold_appointment"]);
  for (const tool of config.model.tools) assert.equal(tool.server.url, "https://api.orvius.im/api/webhooks/vapi");
  assert.deepEqual(config.monitorPlan, { controlEnabled: true });
  assert.equal(config.voice.voiceId, RECEPTIONIST_VOICES[3].id);

  const rotated = buildVapiAssistantConfig({
    businessName: "Sim Heating",
    greeting: "Hi",
    systemPrompt: "x",
    webhookUrl: "https://api.orvius.im/api/webhooks/vapi",
    webhookSecret: "s2",
    voiceId: RECEPTIONIST_VOICES[3].id,
    inCallBooking: true,
  });
  assert.equal(assistantConfigFingerprint(config), assistantConfigFingerprint(rotated), "rotating the secret is not drift");

  assert.equal(resolveVoiceId("not-a-voice"), DEFAULT_VOICE_ID);
  assert.equal(resolveVoiceId(null), DEFAULT_VOICE_ID);
  assert.equal(buildInCallTools({ webhookUrl: "https://x" })[0].server.secret, undefined);
});

test("the owner is told when a caller expects a time that could not be booked", () => {
  const line = ownerAlertContextLine({
    skipReason: "out_of_area",
    heldSlotAt: new Date("2026-09-28T13:00:00Z"),
    timezone: NY,
  });
  assert.match(line, /Outside your service area/);
  assert.match(line, /Caller was offered and took Mon, Sep 28, 9:00 AM EDT on the call/);
});
