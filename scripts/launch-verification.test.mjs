/*
 * The launch gate. A trade is open to new shops only when every one of its
 * named workflows passes the five checks against the production code, and the
 * public pages, signup and receptionist say exactly that scope.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { verifyAllTrades, verifiedTrades, verifyTrade, launchGaps } = await import("../src/lib/launch-verification.ts");
const { TRADE_SCOPES, outsideScope, scopePromptBlock, tradeScope } = await import("../src/lib/trade-scope.ts");
const { LAUNCH_TRADES, OFFERED_TRADES } = await import("../src/lib/trades.ts");
const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
const { buildAssistantSystemPrompt } = await import("../src/lib/business.ts");
const { ownerAlertContextLine } = await import("../src/lib/owner-alert-message.ts");
const { outsideScopeReply } = await import("../src/lib/in-call-tool-defs.ts");
const { tradePage, TRADE_PAGES } = await import("../src/lib/trade-pages.ts");

test("the launched trades are exactly the trades that pass all five checks", () => {
  const failing = verifyAllTrades()
    .filter((r) => LAUNCH_TRADES.includes(r.trade) && !r.passed)
    .map((r) => `${r.trade}: ${Object.values(r.criteria).flat().join("; ")}`);
  assert.deepEqual(failing, [], "a launched trade fails the gate");
  assert.deepEqual([...verifiedTrades()].sort(), [...LAUNCH_TRADES].sort());
  assert.deepEqual([...OFFERED_TRADES].sort(), [...LAUNCH_TRADES].sort());
});

test("every launched trade is a defined set of workflows, hazards and work it does not cover", () => {
  for (const trade of LAUNCH_TRADES) {
    const scope = tradeScope(trade);
    assert.ok(scope, `${trade} has a scope`);
    assert.ok(scope.workflows.length >= 4, `${trade} names its workflows`);
    assert.ok(scope.hazards.length >= 3, `${trade} names the hazards that go to a person`);
    assert.ok(scope.notCovered.length >= 2, `${trade} names what it doesn't cover`);
    for (const w of scope.workflows) assert.ok(w.calls.length >= 1, `${trade} ${w.label} has a call that proves it`);
  }
});

test("a trade that can't sort its calls stays on the interest list, with the reason", () => {
  const garage = verifyAllTrades().find((r) => r.trade === "Garage doors");
  assert.equal(garage.passed, false);
  assert.match(garage.criteria.receive.join(" "), /no demand category/);
  assert.ok(launchGaps(garage).includes("sorting its calls into job types"));
  const cleaning = verifyAllTrades().find((r) => r.trade === "Cleaning");
  assert.match(cleaning.criteria.escalate.join(" "), /No safety rules/);
});

test("the gate catches a broken workflow instead of launching it", () => {
  const plumbing = tradeScope("Plumbing");
  const broken = {
    ...plumbing,
    workflows: [{ ...plumbing.workflows[0], calls: [{ says: "I need my gutters cleaned", urgency: "emergency" }] }],
  };
  const result = verifyTrade(broken);
  assert.equal(result.passed, false);
  assert.match(result.criteria.receive.join(" "), /read as/);
});

test("a sewer line call books as the three-hour sewer job, not a one-hour drain clog", () => {
  const read = classifyRequest({ business: { trade: "Plumbing" }, serviceType: "the main sewer line is clogged" });
  assert.equal(read.service.key, "sewer");
  assert.equal(read.service.durationMin, 180);
  assert.equal(classifyRequest({ business: { trade: "Plumbing" }, serviceType: "kitchen drain is clogged" }).service.key, "drain_clog");
});

test("an AC that runs but doesn't cool is same-day", () => {
  assert.equal(classifyRequest({ business: { trade: "HVAC" }, serviceType: "AC is running but not cooling" }).urgency, "same-day");
});

test("work outside a trade's scope is named, and supported work never is", () => {
  assert.equal(outsideScope("Electrical", "I want solar panels installed")?.key, "solar");
  assert.equal(outsideScope("Plumbing", "our septic tank is backing up")?.key, "well_septic");
  assert.equal(outsideScope("HVAC", "walk-in cooler at the restaurant is warm")?.key, "commercial_equipment");
  assert.equal(outsideScope("Electrical", "breaker keeps tripping"), null);
  assert.equal(outsideScope("Garage doors", "solar"), null);
  for (const scope of TRADE_SCOPES) {
    for (const call of scope.workflows.flatMap((w) => w.calls)) assert.equal(outsideScope(scope.trade, call.says), null, call.says);
  }
});

test("the receptionist is told what it books and what goes to the owner", () => {
  const prompt = buildAssistantSystemPrompt({ name: "Bright Electric", greeting: null, hoursJson: "{}", servicesJson: "[]", trade: "Electrical" });
  assert.match(prompt, /WORK THIS SHOP BOOKS THROUGH YOU/);
  assert.match(prompt, /Breaker keeps tripping/);
  assert.match(prompt, /NOT BOOKED BY YOU/);
  assert.match(prompt, /Solar panels and home batteries/);
  assert.equal(scopePromptBlock("Garage doors"), "");
});

test("an out-of-scope request is refused on the call and flagged to the owner after it", () => {
  assert.match(outsideScopeReply("Standby generators"), /^Do not book this\. Standby generators/);
  assert.match(outsideScopeReply("Standby generators"), /do not offer a time/);
  assert.match(ownerAlertContextLine({ skipReason: "outside_scope", timezone: "America/Chicago" }), /not booked/);
  const autoJob = readFileSync("src/lib/auto-job.ts", "utf8");
  assert.match(autoJob, /skipReason: "outside_scope"/);
  const inCall = readFileSync("src/lib/in-call-tools.ts", "utf8");
  assert.equal((inCall.match(/outsideScopeReply\(outside\.label\)/g) ?? []).length, 2, "both the availability and hold tools refuse");
});

test("public pages state the exact scope and send everyone else to the interest list", () => {
  for (const { slug, trade } of TRADE_PAGES) {
    const page = tradePage(slug);
    assert.deepEqual(page.workflows, tradeScope(trade).workflows.map((w) => w.label));
    assert.ok(page.notCovered.length >= 2);
  }
  const trades = readFileSync("src/app/trades/page.tsx", "utf8");
  assert.match(trades, /verifyAllTrades\(\)/);
  assert.match(trades, /InterestListForm/);
  const form = readFileSync("src/components/interest-list-form.tsx", "utf8");
  assert.match(form, /plan: "interest"/);
  assert.match(readFileSync("src/app/api/waitlist/route.ts", "utf8"), /"interest"/);
  assert.match(readFileSync("src/lib/commercial-terms.ts", "utf8"), /orvius\.im\/trades/);
});
