import assert from "node:assert/strict";
import test from "node:test";
import { gradeCall, summarizeCallQuality } from "../src/lib/call-quality.ts";
import { parseTranscript } from "../src/lib/transcript.ts";

const hvac = { trade: "HVAC", servicesJson: "[]", name: "Summit Heating & Air" };

function call(overrides = {}) {
  return {
    status: "completed",
    durationSec: 140,
    summary: "Caller's AC is not cooling.",
    booked: false,
    successEvaluation: null,
    transcript: [
      "AI: Thanks for calling Summit Heating and Air. What's going on?",
      "User: My AC is not cooling and it's 90 in here.",
      "AI: I'm sorry. What's the address?",
      "User: 18 Oak Street, Austin 78701.",
      "AI: And your name?",
      "User: Dana Whitfield.",
    ].join("\n"),
    ...overrides,
  };
}

function lead(overrides = {}) {
  return {
    name: "Dana Whitfield",
    phone: "+15125550142",
    address: "18 Oak St, Austin TX 78701",
    serviceType: "No cooling",
    urgency: "same-day",
    categoryCode: "hvac.no_cool",
    notes: null,
    status: "booked",
    job: { id: "job_1" },
    ...overrides,
  };
}

test("Vapi transcripts attribute AI and User lines to the right side", () => {
  const lines = parseTranscript("AI: Hi there.\nUser: My AC is out.\n[Demo transcript]\nOrvius: Got it.\nCaller: Thanks.");
  assert.deepEqual(
    lines.map((l) => l.role),
    ["ai", "caller", "unknown", "ai", "caller"],
  );
});

test("a complete, booked call is clean", () => {
  const grade = gradeCall({ call: call({ booked: true }), lead: lead(), business: hvac });
  assert.equal(grade.verdict, "clean");
  assert.equal(grade.score, 100);
  assert.deepEqual(grade.missing, []);
  assert.match(grade.headline, /Clean call/);
});

test("missing callback number or problem is a fix; missing address is a listen", () => {
  const noAddress = gradeCall({ call: call(), lead: lead({ address: null }), business: hvac });
  assert.equal(noAddress.verdict, "listen");
  assert.deepEqual(noAddress.missing, ["address"]);
  assert.match(noAddress.headline, /did not get the caller's address/);

  const noPhone = gradeCall({ call: call(), lead: lead({ phone: "555", name: null }), business: hvac });
  assert.equal(noPhone.verdict, "fix");
  assert.match(noPhone.headline, /name and callback number/);
});

test("a gas smell without safety guidance or emergency urgency is a fix", () => {
  const transcript = [
    "AI: Thanks for calling. What's going on?",
    "User: I smell gas by the furnace.",
    "AI: Okay, what's your address so we can get someone out?",
  ].join("\n");
  const grade = gradeCall({
    call: call({ transcript }),
    lead: lead({ urgency: "same-day", job: null, status: "new" }),
    business: hvac,
  });
  assert.equal(grade.verdict, "fix");
  const keys = grade.findings.map((f) => f.key);
  assert.ok(keys.includes("safety_no_guidance"));
  assert.ok(keys.includes("safety_not_emergency"));
  assert.equal(grade.findings.find((f) => f.key === "safety_no_guidance").quote, "I smell gas by the furnace.");
  assert.ok(!keys.includes("not_booked"), "a hazard is escalated, not booked");

  const handled = gradeCall({
    call: call({
      transcript: `${transcript}\nAI: Please leave the home now and call the gas company or 911 from outside.`,
    }),
    lead: lead({ urgency: "emergency", job: null, status: "new" }),
    business: hvac,
  });
  assert.equal(handled.verdict, "clean");
  assert.match(handled.headline, /gas smell as an emergency and told the caller how to stay safe/i);
});

test("the grade never claims what the transcript does not show", () => {
  const callerOnly = gradeCall({
    call: call({ transcript: "Caller: I smell gas near the furnace" }),
    lead: lead({ serviceType: "I smell gas near the furnace", urgency: "emergency", job: null, status: "new" }),
    business: hvac,
  });
  assert.equal(callerOnly.verdict, "listen", "an unverified hazard call is never graded clean");
  assert.ok(callerOnly.score < 100);
  assert.match(callerOnly.headline, /does not show what Orvius told them/);

  const noAddress = gradeCall({ call: call(), lead: lead({ address: null, job: null, status: "new" }), business: hvac });
  assert.deepEqual(noAddress.findings.map((f) => f.key), ["missing_capture"], "no address means it could not book");

  const onFile = gradeCall({
    call: call(),
    lead: lead({ address: null, job: null, status: "new" }),
    business: hvac,
    knownAddress: "1842 Oak Street",
  });
  assert.deepEqual(onFile.missing, []);
  assert.ok(onFile.captured.includes("address on file"));
});

test("friction in the caller's words is quoted so the owner can find it", () => {
  const transcript = [
    "AI: Thanks for calling. What's going on?",
    "User: My AC is not cooling.",
    "AI: What's the address for the visit?",
    "User: 18 Oak Street.",
    "AI: What's the address for the visit?",
    "User: I already told you, 18 Oak Street.",
    "User: Hello? Are you there?",
    "User: Can I just talk to a real person?",
  ].join("\n");
  const grade = gradeCall({ call: call({ transcript, booked: true }), lead: lead(), business: hvac });
  assert.equal(grade.verdict, "listen");
  const keys = grade.findings.map((f) => f.key).sort();
  assert.deepEqual(keys, ["asked_for_person", "asked_twice", "dead_air", "repeated_self"]);
  assert.equal(
    grade.findings.find((f) => f.key === "repeated_self").quote,
    "I already told you, 18 Oak Street.",
  );
  assert.ok(grade.score < 70);
});

test("a qualified lead left unbooked, a hang-up, and a non-job are told apart", () => {
  const unbooked = gradeCall({ call: call(), lead: lead({ job: null, status: "new" }), business: hvac });
  assert.deepEqual(unbooked.findings.map((f) => f.key), ["not_booked"]);

  const hangUp = gradeCall({
    call: call({ durationSec: 8, transcript: "AI: Thanks for calling.", summary: null }),
    lead: lead({ name: null, address: null, serviceType: null, categoryCode: null, urgency: null, job: null, status: "new" }),
    business: hvac,
  });
  assert.deepEqual(hangUp.findings.map((f) => f.key), ["hung_up"]);

  const spam = gradeCall({
    call: call({ transcript: "AI: Hi.\nUser: This is a sales call about your warranty." }),
    lead: lead({ categoryCode: "other.non_service", name: null, address: null, job: null, status: "new" }),
    business: hvac,
  });
  assert.equal(spam.verdict, "clean");
  assert.match(spam.headline, /Not a job/);
});

test("summary counts verdicts and names the most common problem", () => {
  const grades = [
    gradeCall({ call: call({ booked: true }), lead: lead(), business: hvac }),
    gradeCall({ call: call(), lead: lead({ address: null }), business: hvac }),
    gradeCall({ call: call(), lead: lead({ address: null, name: null }), business: hvac }),
    gradeCall({ call: call({ status: "failed", transcript: null }), lead: null, business: hvac }),
  ];
  const summary = summarizeCallQuality(grades);
  assert.equal(summary.graded, 4);
  assert.equal(summary.clean, 1);
  assert.equal(summary.listen, 2);
  assert.equal(summary.fix, 1);
  assert.deepEqual(summary.top[0], { key: "missing_capture", label: "missed caller details", count: 2 });
});

test("over-talking is flagged: stacked questions and long turns, not the disclosure or danger line", () => {
  const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
  const transcript = [
    "AI: Thanks for calling Summit Heating and Air. This call may be recorded and assisted by an automated receptionist for Summit Heating and Air, and I am here to help you today with anything you need for your heating or cooling system at home or work.",
    "User: My AC is not cooling.",
    "AI: What's the address? And what's your name?",
    "User: 18 Oak Street. Dana.",
    `AI: ${long}.`,
  ].join("\n");
  const grade = gradeCall({ call: call({ transcript, booked: true }), lead: lead(), business: hvac });
  const stacked = grade.findings.find((f) => f.key === "stacked_questions");
  const longReply = grade.findings.find((f) => f.key === "long_reply");
  assert.equal(stacked.quote, "What's the address? And what's your name?");
  assert.ok(longReply.quote.startsWith("word0"));
  assert.equal(grade.verdict, "listen");

  const transcribed = gradeCall({
    call: call({ booked: true, transcript: "AI: Got it? No heat with a baby at home is urgent. What is the full address?\nUser: 18 Oak Street." }),
    lead: lead(),
    business: hvac,
  });
  assert.ok(!transcribed.findings.some((f) => f.key === "stacked_questions"));

  const clean = gradeCall({ call: call({ booked: true }), lead: lead(), business: hvac });
  assert.ok(!clean.findings.some((f) => f.key === "stacked_questions" || f.key === "long_reply"));
});
