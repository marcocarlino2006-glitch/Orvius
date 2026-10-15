#!/usr/bin/env node
/*
 * The September 26 sample call, pinned. A caller with no heat and a baby at
 * home got the gas-leak evacuation script though nobody mentioned gas, and
 * "just use the number I'm calling from" got an invented 1234567890 read
 * back. The prompt was fixed that day; these tests hold every layer that
 * could let it back in: the prompt contract, the sim graders that gate a
 * receptionist change, the post-call review that grades every live call,
 * and the callback number the owner is handed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { digitRuns, inventedNumbers, trustedCallbackNumber, callerUsedCallingNumber } = await import("../src/lib/callback-number.ts");
const { gradeCall } = await import("../src/lib/call-quality.ts");
const { buildAssistantSystemPrompt } = await import("../src/lib/business.ts");
const { scenarios } = await import("./voice-scenarios.mjs");
const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const CALLER_ID = "+13125550177";

/* The sample as reported: urgent, not dangerous — and treated as both. */
const SEPT_26 = [
  "AI: Thanks for calling Summit Heating & Air, this is Orvius. How can I help?",
  "User: Our heat went out last night and I have a baby at home. It's really cold in here.",
  "AI: Please leave the home now, don't touch any switches, and call the gas company or 911 from outside.",
  "User: What? I don't smell gas. It's just cold.",
  "AI: Understood. What number should the team call you back on?",
  "User: Just use the number I'm calling from.",
  "AI: Got it. I have one two three, four five six, seven eight nine zero. Is that right?",
  "User: Sure.",
].join("\n");

const SEPT_26_SPANISH = [
  "AI: Gracias por llamar. ¿En qué le puedo ayudar?",
  "User: No tenemos calefacción y tengo un bebé de seis meses.",
  "AI: Por favor salga de la casa ahora y llame a la compañía de gas o al 911 desde afuera.",
  "User: Use el mismo número del que llamo.",
  "AI: Perfecto, tengo el 123-456-7890.",
].join("\n");

/* What the prompt asks for on the same call. */
const RIGHT_WAY = [
  "AI: Thanks for calling Summit Heating & Air, this is Orvius. How can I help?",
  "User: Our heat went out last night and I have a baby at home.",
  "AI: I'm sorry — I'm marking this urgent so the team calls you right back. What's your name?",
  "User: Rosa Díaz.",
  "AI: Thanks, Rosa. What number should they call you back on?",
  "User: Just use the number I'm calling from.",
  "AI: Got it — we'll use the number you're calling from. And the service address?",
  "User: 77 Pine Street, Evanston 60201.",
  "AI: Seven seven Pine Street — is that right?",
  "User: Yes.",
].join("\n");

const lead = (over = {}) => ({
  name: "Rosa Díaz",
  phone: CALLER_ID,
  address: "77 Pine Street, Evanston 60201",
  serviceType: "No heat",
  urgency: "emergency",
  ...over,
});
const grade = (transcript, over = {}) =>
  gradeCall({
    call: { status: "ended", durationSec: 140, transcript, summary: "No heat with a baby at home.", booked: false },
    lead: lead(over),
    business: { trade: "HVAC" },
  });
const keys = (g) => g.findings.map((f) => f.key);

test("digits are read the way callers and receptionists say them", () => {
  assert.deepEqual(digitRuns("312-555-0147"), ["3125550147"]);
  assert.deepEqual(digitRuns("(312) 555 0147"), ["3125550147"]);
  assert.deepEqual(digitRuns("three one two, five five five, zero one four seven"), ["3125550147"]);
  assert.deepEqual(digitRuns("three one two, double five five, oh one four seven"), ["3125550147"]);
  assert.deepEqual(digitRuns("tres uno dos cinco cinco cinco cero uno cuatro siete"), ["3125550147"]);
  assert.ok(digitRuns("1812 Chicago Avenue, Evanston 60201").every((r) => r.length < 7), "an address is not a phone number");
  assert.ok(digitRuns("Tuesday at 9 AM or 2 PM").every((r) => r.length < 7));
});

test("the Sept 26 call fails review twice: danger script with no danger, and a number nobody said", () => {
  for (const transcript of [SEPT_26, SEPT_26_SPANISH]) {
    const g = grade(transcript);
    assert.ok(keys(g).includes("false_danger"), keys(g).join(","));
    assert.ok(keys(g).includes("invented_number"), keys(g).join(","));
    assert.equal(g.findings.find((f) => f.key === "false_danger").severity, "fix");
    assert.equal(g.findings.find((f) => f.key === "invented_number").severity, "fix", "the caller asked for their own number, so it was made up");
    assert.equal(g.verdict, "fix");
  }
});

test("\"I don't smell gas\" is a denial, not a gas call", () => {
  const denial = [
    "User: The furnace stopped and the baby's room is freezing. I don't smell gas or anything.",
    "AI: I'm marking this urgent so the team calls you right back. What's your name?",
  ].join("\n");
  const g = grade(denial, { notes: "Caller does not smell gas." });
  assert.ok(!keys(g).includes("safety_no_guidance"), "no danger script is owed when the caller ruled gas out");
  assert.ok(!keys(g).includes("false_danger"));
});

test("the same call handled the right way is clean on both counts", () => {
  const g = grade(RIGHT_WAY);
  assert.ok(!keys(g).includes("false_danger"), keys(g).join(","));
  assert.ok(!keys(g).includes("invented_number"), keys(g).join(","));
});

test("a real gas call still gets the danger script without being called a false alarm", () => {
  const gas = [
    "User: I smell gas in the kitchen and my furnace is off.",
    "AI: Please leave the home now, don't touch any switches, and call the gas company or 911 from outside.",
    "User: Okay, I'm outside. It's 312-555-0150.",
    "AI: Three one two, five five five, zero one five zero — is that right?",
  ].join("\n");
  const g = grade(gas, { serviceType: "Gas smell", phone: "+13125550150" });
  assert.ok(!keys(g).includes("false_danger"));
  assert.ok(!keys(g).includes("invented_number"), "reading back what the caller said is the rule, not a fault");
  assert.ok(!keys(g).includes("safety_no_guidance"));
});

test("a read-back that doesn't match what the caller said is a listen, not a fabrication", () => {
  const misheard = [
    "User: No heat. Call me at 312-555-0161.",
    "AI: I have three one two, five five five, zero one six two. Is that right?",
    "User: Yes.",
  ].join("\n");
  const g = grade(misheard, { phone: "+13125550161" });
  const f = g.findings.find((x) => x.key === "invented_number");
  assert.ok(f);
  assert.equal(f.severity, "watch");
  assert.match(f.label, /does not match/);
});

test("the shop's own line may be said aloud", () => {
  const t = ["User: Is this the right number for Summit?", "AI: Yes, our line is 847-555-0100."].join("\n");
  assert.equal(inventedNumbers(t, ["+18475550100"]).length, 0);
  assert.equal(inventedNumbers(t).length, 1);
});

test("the stored callback number comes from the caller, never from a number the model made up", () => {
  assert.ok(callerUsedCallingNumber(SEPT_26));
  assert.ok(callerUsedCallingNumber(SEPT_26_SPANISH));
  assert.deepEqual(trustedCallbackNumber({ extracted: "+11234567890", callerId: CALLER_ID, transcript: SEPT_26 }), { phone: CALLER_ID, replaced: true });
  const alternate = "User: Calling from my work phone, but call me back at 312-555-0199.";
  assert.deepEqual(trustedCallbackNumber({ extracted: "+13125550199", callerId: CALLER_ID, transcript: alternate }), { phone: "+13125550199", replaced: false });
  assert.deepEqual(trustedCallbackNumber({ extracted: null, callerId: CALLER_ID, transcript: SEPT_26 }), { phone: CALLER_ID, replaced: false });
  assert.deepEqual(trustedCallbackNumber({ extracted: "+13125550199", callerId: null, transcript: SEPT_26 }), { phone: "+13125550199", replaced: false }, "no caller ID: keep it, review flags it");
  assert.deepEqual(trustedCallbackNumber({ extracted: "+13125550199", callerId: CALLER_ID, transcript: null }), { phone: "+13125550199", replaced: false }, "nothing to check against");
});

test("ingest: a made-up read-back never becomes the lead's callback number, and the trace says so", async () => {
  const shop = await prisma.business.create({
    data: { name: "Sept 26 Air", slug: `sept26-${Date.now()}-${uid()}`, environment: "test", trade: "HVAC", timezone: "America/Chicago", ownerEmail: `o-${uid()}@example.test`, billingStatus: "active", billingPlan: "pro" },
  });
  try {
    const vapiCallId = `sept26-${uid()}`;
    await ingestEndOfCallReport({
      business: { id: shop.id },
      vapiCallId,
      message: {
        type: "end-of-call-report",
        call: { id: vapiCallId, customer: { number: CALLER_ID } },
        summary: "No heat with a baby at home.",
        transcript: SEPT_26,
        durationSeconds: 140,
        analysis: { structuredData: { name: "Rosa Díaz", phone: "1234567890", serviceType: "No heat", urgency: "emergency", address: "77 Pine Street, Evanston 60201" } },
      },
    });
    const call = await prisma.call.findUniqueOrThrow({ where: { vapiCallId }, include: { lead: true } });
    assert.equal(call.lead.phone, CALLER_ID, "the owner calls the real caller back");
    assert.equal(call.callerPhone, CALLER_ID);
    const flagged = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "call.invented_number" } });
    assert.ok(flagged, "the trace records the made-up read-back");
    assert.match(flagged.summary, /never said/);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
const sim = (id, ai, structured = {}) => byId[id].grade({ ai, structured, durationSec: 90, call: { analysis: { summary: "" } }, prompt: "" });
const aiSide = (t) => t.split("\n").filter((l) => l.startsWith("AI:")).map((l) => l.slice(3).trim()).join("\n");

test("the ship gate fails the Sept 26 behavior in any wording, and passes the right one", () => {
  assert.ok(byId["calling-from"].gate && byId["no-heat-baby"].gate, "both block a receptionist change");
  const emergency = { urgency: "emergency", phone: "+13125550193" };
  assert.notDeepEqual(sim("calling-from", aiSide(SEPT_26), emergency), []);
  assert.notDeepEqual(sim("calling-from", "Got it — we'll use the number you're calling from. I have 555-0100 on file.", emergency), []);
  assert.notDeepEqual(sim("calling-from", "Got it — we'll use the number you're calling from. Please get everyone out of the house.", emergency), []);
  assert.deepEqual(sim("calling-from", aiSide(RIGHT_WAY), emergency), []);

  assert.notDeepEqual(sim("no-heat-baby", "If you smell gas, call the gas company from outside. I'm marking this urgent.", emergency), []);
  assert.notDeepEqual(sim("no-heat-baby", "Please evacuate and call 911.", emergency), []);
  assert.notDeepEqual(sim("no-heat-baby", "I'm marking this urgent so the team calls you right back.", { ...emergency, urgency: "same-day" }), [], "a baby with no heat is an emergency");
  assert.deepEqual(sim("no-heat-baby", "I'm marking this urgent so the team calls you right back.", emergency), []);
  assert.deepEqual(byId["no-heat-baby"].tools.never.sort(), ["alert_team_now", "hold_appointment"]);
});

test("the live prompt separates urgent from dangerous and forbids reading out unsaid digits", () => {
  const prompt = buildAssistantSystemPrompt({ name: "Summit Heating & Air", trade: "HVAC", hoursJson: "{}", servicesJson: "[]", timezone: "America/Chicago" });
  assert.match(prompt, /DANGER — only gas smell, carbon monoxide alarm, smoke or sparking/);
  assert.match(prompt, /baby or elderly person at home is urgent, not dangerous\. NEVER tell those callers to leave the home or call 911/);
  assert.match(prompt, /You cannot see that number: never read out digits the caller did not say/);
  assert.match(prompt, /callback number \(read back only digits the caller said; if they said to use the number they're calling from, confirm that instead — never say digits\)/);
  assert.doesNotMatch(prompt, /callback number \(read it back\)/, "the closing checklist no longer orders an unconditional read-back");
});

test.after(() => prisma.$disconnect());

test("the request classifier escalates gas and CO however callers say it, and not when they deny it", async () => {
  const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
  const { mentionsDanger } = await import("../src/lib/safety-guidance.ts");
  const shop = (trade) => ({ trade, name: "Sample", servicesJson: "[]" });
  const safety = (trade, words) => classifyRequest({ business: shop(trade), callerWords: words }).safety?.key ?? null;

  assert.equal(safety("HVAC", "No heat and a newborn, it's freezing. I don't smell gas."), null, "the Sept 26 caller denied gas");
  assert.equal(safety("Plumbing", "Water heater leaking, no gas smell"), null);
  assert.equal(safety("HVAC", "I smell gas by the furnace"), "gas_smell");
  assert.equal(safety("Plumbing", "There's a rotten egg smell by the water heater"), "gas_smell", "mercaptan is how people describe gas");
  assert.equal(safety("HVAC", "The carbon-monoxide detector keeps going off"), "carbon_monoxide");
  assert.equal(safety("Electrical", "My CO alarm is beeping"), "carbon_monoxide", "CO escalates on any trade's line");
  assert.equal(safety("Electrical", "The smoke detector needs a new battery"), null, "a battery chirp is not a fire");
  assert.equal(safety("Electrical", "The smoke alarm is going off and the outlet is hot"), "sparking");

  for (const reported of ["No, it smells like gas", "I've never smelled gas this strong", "I didn't smell gas until now", "There's no smoke but I smell gas"]) {
    assert.equal(mentionsDanger(reported), true, `still a report: ${reported}`);
  }
  for (const denied of ["I don't smell gas", "No gas smell or anything", "do not smell any gas", "no hay olor a gas"]) {
    assert.equal(mentionsDanger(denied), false, `a denial: ${denied}`);
  }
});
