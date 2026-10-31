#!/usr/bin/env node
/*
 * After every call, Vapi's analysis model grades the receptionist against a
 * trade rubric a good dispatcher would use. A failed check becomes a finding
 * on the call, lowers its grade, and becomes a regression scenario the nightly
 * simulator replays. The verdict goes when the call's words go.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { judgeChecks, judgeSchema, readJudgeVerdict, judgeFailures } = await import("../src/lib/call-judge.ts");
const { gradeCall } = await import("../src/lib/call-quality.ts");
const { learnScenario } = await import("../src/lib/learned-scenarios.ts");
const { buildVapiAssistantConfig } = await import("../src/lib/vapi.ts");
const { captureEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { loadCallReviews, forgetCallReviews } = await import("../src/lib/call-review.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];
test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const KEYS = ["understood_problem", "trade_questions", "safety_first", "confirmed_booking", "stuck_to_facts", "clear_next_step"];

test("the rubric asks each trade's dispatcher questions, and every answer is pass, fail or n/a", () => {
  assert.deepEqual(judgeChecks("HVAC").map((c) => c.key), KEYS);
  const hvac = judgeSchema("HVAC");
  assert.match(hvac.properties.trade_questions.description, /blowing air but not cold/);
  assert.match(judgeSchema("Plumbing").properties.trade_questions.description, /shut off/);
  assert.match(judgeSchema("Electrical").properties.trade_questions.description, /breaker tripped/);
  assert.match(judgeSchema("Roofing").properties.trade_questions.description, /technician would need/);
  for (const key of KEYS) assert.deepEqual(hvac.properties[key].enum, ["pass", "fail", "n/a"]);
  assert.match(hvac.description, /Grade the receptionist \(the AI\), not the caller/);
});

test("every shop's assistant carries the rubric for its own trade", () => {
  const config = buildVapiAssistantConfig({
    businessName: "Cool Air",
    systemPrompt: "x",
    greeting: "Hi",
    webhookUrl: "https://orvius.im/api/webhooks/vapi",
    trade: "Plumbing",
  });
  const review = config.analysisPlan.structuredDataPlan.schema.properties.callReview;
  assert.match(review.properties.trade_questions.description, /shut off/);
  const other = buildVapiAssistantConfig({ businessName: "Cool Air", systemPrompt: "x", greeting: "Hi", webhookUrl: "https://orvius.im/api/webhooks/vapi", trade: "HVAC" });
  assert.notEqual(config.metadata.orviusConfig, other.metadata.orviusConfig, "a trade change re-syncs the assistant");
});

test("only answers from the rubric are trusted", () => {
  assert.equal(readJudgeVerdict(null), null);
  assert.equal(readJudgeVerdict({ name: "Ann" }), null);
  assert.equal(readJudgeVerdict({ callReview: { understood_problem: "maybe" } }), null);
  const verdict = readJudgeVerdict({
    callReview: { understood_problem: " FAIL ", stuck_to_facts: "pass", safety_first: "n/a", made_up: "fail", worst_line: "  It'll be   $89, guaranteed.  " },
  });
  assert.deepEqual(verdict, { answers: { understood_problem: "fail", safety_first: "n/a", stuck_to_facts: "pass" }, worstLine: "It'll be $89, guaranteed." });
  assert.deepEqual(judgeFailures(verdict).map((c) => c.key), ["understood_problem"]);
});

const clean = {
  call: { status: "completed", durationSec: 90, transcript: "AI: Thanks for calling.\nUser: My AC is out.", summary: "AC out", booked: true },
  lead: { name: "Ann Lee", phone: "+15125550101", address: "12 Oak St", serviceType: "AC not cooling", urgency: "same-day", job: { id: "j1" } },
  business: { trade: "HVAC" },
};

test("a failed check lowers the grade, names the problem and quotes the line", () => {
  const before = gradeCall(clean);
  const review = { answers: { stuck_to_facts: "fail", clear_next_step: "fail", understood_problem: "pass", safety_first: "n/a" }, worstLine: "It'll be $89, guaranteed." };
  const after = gradeCall({ ...clean, review });
  assert.equal(after.verdict, "fix");
  assert.equal(after.score, before.score - 28);
  assert.equal(after.headline, "Orvius said something it wasn't told: a price, a policy or a promise.");
  const keys = after.findings.map((f) => f.key);
  assert.deepEqual(keys, ["judge_stuck_to_facts", "judge_clear_next_step"]);
  assert.equal(new Set(keys).size, keys.length, "keys stay unique for the call screen");
  assert.equal(after.findings[0].quote, "It'll be $89, guaranteed.");
  assert.deepEqual(gradeCall({ ...clean, review: { answers: { understood_problem: "pass" }, worstLine: null } }), before);
});

test("a judged miss becomes a scenario the nightly simulator replays", () => {
  const grade = gradeCall({ ...clean, review: { answers: { stuck_to_facts: "fail", confirmed_booking: "fail" }, worstLine: null } });
  const scenario = learnScenario({ id: "call-1", transcript: clean.call.transcript, summary: "AC out", lead: clean.lead, business: { trade: "HVAC" }, grade });
  assert.ok(scenario);
  assert.ok(scenario.learnedFrom.findings.includes("judge_stuck_to_facts"));
  assert.match(scenario.persona, /How much is that going to cost/);
  assert.match(scenario.persona, /reads back the day, the time and your address/);
  assert.deepEqual(scenario.tools.must, ["check_availability", "hold_appointment"]);
});

test("the end-of-call report saves the verdict; forgetting the call's words removes it; deleting the call removes it", async () => {
  const shop = await prisma.business.create({
    data: { name: "Judge Air", slug: `judge-${Date.now()}-${uid()}`, environment: "test", trade: "HVAC", ownerEmail: `o-${uid()}@example.test`, billingStatus: "active", billingPlan: "pro" },
  });
  made.push(shop.id);
  const vapiCallId = `vapi-judge-${uid()}`;
  const captured = await captureEndOfCallReport({
    business: shop,
    vapiCallId,
    message: {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: "+15125550101" } },
      summary: "Ann called about AC.",
      transcript: "User: my AC is not cooling",
      durationSeconds: 60,
      analysis: { structuredData: { name: "Ann Lee", callReview: { understood_problem: "pass", stuck_to_facts: "fail", worst_line: "It's $89." } } },
    },
  });
  const callId = captured.call.id;
  const row = await prisma.callReview.findUnique({ where: { callId } });
  assert.equal(row.businessId, shop.id);
  assert.equal(row.failed, 1);
  assert.deepEqual((await loadCallReviews([callId])).get(callId).answers, { understood_problem: "pass", stuck_to_facts: "fail" });

  await forgetCallReviews([callId]);
  assert.equal(await prisma.callReview.count({ where: { callId } }), 0);

  await prisma.callReview.create({ data: { callId, businessId: shop.id, verdictJson: "{}", failed: 0 } });
  await prisma.call.delete({ where: { id: callId } });
  assert.equal(await prisma.callReview.count({ where: { callId } }), 0, "removed with its call");
  assert.equal((await loadCallReviews([callId])).size, 0);
});
