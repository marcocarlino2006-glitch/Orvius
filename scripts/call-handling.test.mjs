#!/usr/bin/env node
/*
 * What happens to a call after it ends: why the caller rang, how urgent it is,
 * what the receptionist committed to, and what the owner is told.
 *
 * Each case here is a call that `npm run sim:calls` found mishandled end to
 * end, or a failure that recurs in public reviews of answering services and
 * AI receptionists (appointments texted in the wrong time zone, invented
 * prices and arrival times, spam and hang-ups paged to the owner).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { detectCallIntent } from "../src/lib/call-intent.ts";
import { classifyRequest, normalizeUrgency } from "../src/lib/trade-playbooks.ts";
import { callerWords } from "../src/lib/transcript.ts";
import { describeAssistantPromises, detectAssistantPromises } from "../src/lib/assistant-promises.ts";
import { buildOwnerLeadAlertMessage, ownerAlertContextLine } from "../src/lib/owner-alert-message.ts";
import { buildTechJobAssignMessage } from "../src/lib/tech-assign-sms.ts";

const hvac = { trade: "HVAC", servicesJson: "[]", name: "Sim Heating" };

test("a call about booked work is not a new request", () => {
  assert.equal(detectCallIntent("I need to cancel tomorrow's appointment"), "cancel");
  assert.equal(detectCallIntent("Can we move my appointment to Friday?"), "reschedule");
  assert.equal(detectCallIntent("What time is the tech coming?"), "status");
  assert.equal(detectCallIntent("Quiero cancelar la cita"), "cancel");
  assert.equal(detectCallIntent("Furnace is blowing cold air"), "new");
  assert.equal(detectCallIntent(null, ""), "new");
});

test("only the caller's words are scanned, not the receptionist's safety script", () => {
  const transcript = "AI: If you ever smell gas, leave the home.\nUser: The AC is just making a rattling noise.";
  assert.equal(callerWords(transcript), "The AC is just making a rattling noise.");
  const routine = classifyRequest({ business: hvac, serviceType: "AC rattling", callerWords: callerWords(transcript) });
  assert.equal(routine.safety, null);

  const hidden = classifyRequest({
    business: hvac,
    serviceType: "Furnace won't turn on",
    callerWords: callerWords("User: Furnace won't turn on and I smell gas in the basement."),
  });
  assert.equal(hidden.safety?.key, "gas_smell");
});

test("urgency is read the way a dispatcher would", () => {
  const u = (words, urgency) => classifyRequest({ business: hvac, callerWords: words, urgency }).urgency;
  assert.equal(u("No heat and my elderly mother is freezing"), "emergency");
  assert.equal(u("No tengo calefacción y tengo un bebé"), "emergency");
  assert.equal(u("Water pouring from the indoor unit"), "emergency");
  assert.equal(u("AC died this morning, it's 96 in here and the dog is panting"), "same-day");
  assert.equal(normalizeUrgency("ASAP!!"), "same-day");
  assert.equal(normalizeUrgency("emergencia"), "emergency");
});

test("commitments the receptionist voiced are flagged; declining to commit is not", () => {
  const promised = detectAssistantPromises(
    "User: Grinding noise.\nAI: The diagnostic is $89 and a tech can be there within the hour.",
  );
  assert.deepEqual(promised.map((p) => p.kind), ["price", "arrival"]);
  assert.match(describeAssistantPromises(promised) ?? "", /a price and an arrival time/);

  assert.deepEqual(detectAssistantPromises("AI: I can't quote a price over the phone, but the owner will confirm it."), []);
  assert.deepEqual(detectAssistantPromises("User: Is it $89?\nAI: The owner will confirm pricing."), []);
  assert.deepEqual(detectAssistantPromises("AI: Repairs are covered by our warranty.").map((p) => p.kind), ["warranty"]);
});

test("claiming to have found a record it could not see is flagged", () => {
  for (const line of [
    "AI: I've confirmed that we have your request. Regarding the air conditioner.",
    "AI: I can see your appointment for Tuesday.",
    "AI: We have your request on file from earlier.",
    "AI: I found your account.",
  ]) {
    assert.deepEqual(detectAssistantPromises(line).map((p) => p.kind), ["lookup"], line);
  }
  for (const line of [
    "AI: Let me check the schedule.",
    "AI: We have your information and the team will call you.",
    "AI: I see. That sounds frustrating.",
    "AI: I can't confirm that over the phone.",
    "AI: I've confirmed your callback number is 555-0199.",
  ]) {
    assert.deepEqual(detectAssistantPromises(line), [], line);
  }
  assert.match(describeAssistantPromises(detectAssistantPromises("AI: I found your account.")) ?? "", /finding a record it could not see/);
});

test("the owner's text says what the call was actually about", () => {
  const tz = "America/Chicago";
  const job = { title: "Furnace repair", scheduledAt: new Date("2026-09-29T13:00:00Z") };
  assert.match(
    ownerAlertContextLine({ timezone: tz, skipReason: "existing_job", intent: "cancel", existingJob: job }) ?? "",
    /^Wants to cancel the Furnace repair on Tue, Sep 29, 8:00 AM CDT\. Not cancelled yet/,
  );
  assert.match(ownerAlertContextLine({ timezone: tz, skipReason: "existing_job", intent: "status", existingJob: job }) ?? "", /^Asking about their/);
  assert.match(ownerAlertContextLine({ timezone: tz, skipReason: "existing_job", intent: "new", existingJob: job }) ?? "", /^Called again/);
  assert.match(ownerAlertContextLine({ timezone: tz, skipReason: "follow_up", intent: "reschedule" }) ?? "", /no open job matches/);
  assert.equal(ownerAlertContextLine({ timezone: tz, skipReason: "out_of_area" }), "Outside your service area · not booked");
  assert.match(ownerAlertContextLine({ timezone: tz, skipReason: "missing_address", wantsHuman: true }) ?? "", /No address yet[\s\S]*Asked for a person/);
  assert.match(ownerAlertContextLine({ timezone: tz, silentHangup: true, skipReason: "missing_address" }) ?? "", /^Hung up without saying anything/);
  assert.equal(ownerAlertContextLine({ timezone: tz }), null);
});

test("when the extractor returns nothing, the headline comes from the call summary", () => {
  const message = buildOwnerLeadAlertMessage({
    lead: { phone: "+13125550100" },
    timezone: "America/Chicago",
    context: { summary: "Caller's AC is not cooling and the upstairs is 88 degrees. Wants someone today." },
  });
  assert.match(message.split("\n")[0], /^Caller's AC is not cooling/);
});

test("appointment times are texted in the shop's zone, not the server's", () => {
  const scheduledAt = new Date("2026-09-29T13:00:00Z");
  const owner = buildOwnerLeadAlertMessage({
    lead: { name: "Joel Park", serviceType: "Thermostat blank" },
    job: { scheduledAt },
    autoBooked: true,
    timezone: "America/Chicago",
  });
  assert.match(owner, /Tue, Sep 29, 8:00 AM CDT/);

  const tech = buildTechJobAssignMessage({
    id: "job_1",
    title: "Thermostat blank",
    scheduledAt,
    business: { name: "Sim Heating", timezone: "America/Los_Angeles" },
  });
  assert.match(tech, /When: Tue, Sep 29, 6:00 AM PDT/);
});

test("a complaint about a past visit or bill is held for a person, never booked", () => {
  assert.equal(detectCallIntent("You came out Tuesday and the furnace is still not working"), "complaint");
  assert.equal(detectCallIntent("I was charged twice, I want a refund"), "complaint");
  assert.equal(detectCallIntent("Quiero un reembolso"), "complaint");
  assert.equal(detectCallIntent("My furnace broke, can someone come out?"), "new");
  assert.match(ownerAlertContextLine({ timezone: "UTC", skipReason: "complaint" }) ?? "", /past visit or bill/);
});

test("a callback number that differs from caller ID is surfaced, not silently trusted", () => {
  assert.match(
    ownerAlertContextLine({ timezone: "UTC", callerId: "+13125550100" }) ?? "",
    /^Called from \+13125550100 · confirm which number is right$/,
  );
});

test("the receptionist prompt carries the fixes the voice simulator proved on real calls", async () => {
  const { buildAssistantSystemPrompt } = await import("../src/lib/business.ts");
  const prompt = buildAssistantSystemPrompt({
    name: "Lakeside Plumbing",
    greeting: null,
    hoursJson: "{}",
    servicesJson: "[]",
    trade: "Plumbing",
  });
  assert.doesNotMatch(prompt, /Summit/, "another shop's name leaked into the prompt");
  assert.doesNotMatch(prompt, /within \d+ minutes/i, "the prompt itself promised a callback time");
  assert.match(prompt, /answer in Spanish/);
  assert.match(prompt, /say this FIRST[\s\S]{0,80}leave the home now/);
  assert.match(prompt, /use their spelling exactly/);
  assert.match(prompt, /do not ask the caller to pick a category/);
});

test("the provisioned voice config transcribes Spanish and ignores one-word backchannels", async () => {
  const { buildVapiAssistantConfig } = await import("../src/lib/vapi.ts");
  const config = buildVapiAssistantConfig({ businessName: "X", systemPrompt: "p", greeting: "g", webhookUrl: "https://x" });
  assert.equal(config.transcriber.language, "multi");
  assert.ok((config.stopSpeakingPlan?.numWords ?? 0) >= 2);
});
