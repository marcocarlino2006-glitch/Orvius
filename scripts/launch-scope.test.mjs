import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobRowFacts } from "../src/lib/job-row.ts";
import { claimedCents, collectedCents, collectedHow, isCollected, paidBankLine } from "../src/lib/payment-math.ts";
import { isSetupTrade, setupTradeGroups } from "../src/lib/setup-flow.ts";
import { isLaunchTrade, LAUNCH_TRADES, NOT_YET_TRADE } from "../src/lib/trades.ts";
import { TRADE_PAGES } from "../src/lib/trade-pages.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("signup offers only the trades with a tested playbook", () => {
  assert.deepEqual([...LAUNCH_TRADES], ["HVAC", "Plumbing", "Electrical"]);
  for (const t of LAUNCH_TRADES) assert.ok(isSetupTrade(t) && isLaunchTrade(t));
  for (const t of ["Salon & spa", "Roofing", "Dental office", "Auto repair", "Locksmith"]) {
    assert.equal(isSetupTrade(t), false, t);
  }
  const shown = setupTradeGroups().flatMap((g) => g.trades);
  assert.deepEqual(shown.sort(), [...LAUNCH_TRADES].sort());
  assert.ok(setupTradeGroups().every((g) => g.trades.length > 0), "no empty trade group");
  assert.match(NOT_YET_TRADE, /interest list/);
});

test("public trade pages exist only for launch trades", () => {
  const slugs = TRADE_PAGES.map((p) => p.slug).sort();
  assert.deepEqual(slugs, ["electrical", "hvac", "plumbing"]);
  const config = read("next.config.ts");
  assert.match(config, /\/for\/:trade\(roofing\|garage-doors\|pest-control\|locksmith\|appliance-repair\)/);
});

test("the homepage shows launch trades and no salon or clinic example", () => {
  const demos = read("src/components/home-demos.tsx");
  const features = read("src/components/home-features.tsx");
  assert.doesNotMatch(demos, /\bsalon|\bspa\b|dental|clinic/i);
  assert.doesNotMatch(features, /salon|dental|clinic/i);
  assert.match(features, /waitlist/);
});

test("only money in hand counts as collected", () => {
  const payments = [
    { amountCents: 10000, status: "recorded", method: "cash" },
    { amountCents: 5000, status: "succeeded", method: "stripe:cs_1" },
    { amountCents: 7000, status: "claimed", method: "customer_said" },
    { amountCents: 2000, status: "rejected", method: "customer_said" },
    { amountCents: 3000, status: "refunded", method: "stripe:cs_2" },
    { amountCents: 4000, status: "failed", method: "stripe:cs_3" },
    { amountCents: 6000, status: "superseded", method: "customer_said" },
  ];
  assert.equal(collectedCents(payments), 15000);
  assert.equal(claimedCents(payments), 7000);
  for (const s of ["claimed", "rejected", "refunded", "failed", "superseded"]) assert.equal(isCollected(s), false, s);
  assert.equal(collectedHow(payments), "cash and card (confirmed by the processor)");
  assert.equal(collectedHow([{ amountCents: 1, status: "claimed", method: "customer_said" }]), null);
  assert.match(paidBankLine("card (confirmed by the processor)", true), /pays out to your bank/);
  assert.match(paidBankLine("card (confirmed by the processor)", false), /payouts are on/);
  assert.match(paidBankLine("cash", true), /did not go to your bank/);
  assert.match(paidBankLine("cash and card (confirmed by the processor)", true), /rest stayed in the shop/);
  assert.equal(paidBankLine("card (confirmed by the processor)", true, { inBankOn: "Oct 20" }), "In your bank as of Oct 20.");
  assert.match(paidBankLine("cash and card (confirmed by the processor)", true, { inBankOn: "Oct 20" }), /in your bank as of Oct 20/);
  assert.match(paidBankLine("cash and card (confirmed by the processor)", true, { inBankOn: "Oct 20" }), /rest stayed in the shop/);
  assert.equal(paidBankLine("card (confirmed by the processor)", true, { paysOutOn: "Oct 24" }), "Pays out to your bank on Oct 24.");
  assert.equal(paidBankLine("card (confirmed by the processor)", true, { waitingOnPayout: true }), "Waiting on the next payout to your bank.");
  assert.match(paidBankLine("card (confirmed by the processor)", false, { inBankOn: "Oct 20" }), /payouts are on/);
});

const base = {
  status: "completed",
  urgency: null,
  createdAt: "2026-09-24T10:00:00Z",
  scheduledAt: "2026-09-24T12:00:00Z",
  customerConfirmedAt: "2026-09-24T09:00:00Z",
  technician: { name: "Ana" },
};
const withInvoice = (invoice) => ({ ...base, estimate: { amountCents: 50000, status: "accepted", invoice } });
const now = Date.parse("2026-09-24T15:00:00Z");

test("a customer's 'I paid' is not shown as collected", () => {
  const f = jobRowFacts(
    withInvoice({ amountCents: 50000, status: "sent", sentAt: "2026-09-24T13:00:00Z", payments: [{ amountCents: 50000, status: "claimed" }] }),
    now,
  );
  assert.equal(f.money.kind, "claimed");
  assert.match(f.money.label, /customer says paid/);
  assert.match(f.attention.reason, /Confirm the money arrived/);
});

test("an issued bill that was never sent is called out", () => {
  const f = jobRowFacts(withInvoice({ amountCents: 50000, status: "draft", sentAt: null, payments: [] }), now);
  assert.equal(f.money.kind, "unsent");
  assert.match(f.money.label, /not sent/);
  assert.match(f.attention.reason, /never sent/);
});

test("collected money reads as collected", () => {
  const f = jobRowFacts(
    withInvoice({ amountCents: 50000, status: "paid", sentAt: "2026-09-24T13:00:00Z", payments: [{ amountCents: 50000, status: "recorded" }] }),
    now,
  );
  assert.equal(f.money.kind, "paid");
  assert.match(f.money.label, /collected/);
  assert.equal(f.attention, null);
});

test("the public pay page can't mark a bill paid", () => {
  const route = read("src/app/api/public/estimate/[token]/route.ts");
  const manual = route.slice(route.indexOf('"pay_manual"'));
  assert.match(manual, /recordCustomerClaim/);
  assert.doesNotMatch(manual.slice(0, 2500), /status: "paid"|status: "recorded"/);
  assert.match(manual, /enqueueOwnerAlert/);
});

test("owner payments are recorded with a method, audited, and claims need the owner", () => {
  const api = read("src/app/api/payments/route.ts");
  assert.match(api, /requireEntitledSession/);
  assert.match(api, /requirePlanModule\(business, "jobs"\)/);
  assert.match(api, /"confirm"/);
  assert.match(api, /"reject"/);
  const lib = read("src/lib/payment-record.ts");
  for (const action of ["payment.claimed", "payment.recorded", "payment.confirmed", "payment.claim_rejected"]) {
    assert.ok(lib.includes(action), action);
  }
  const bill = read("src/components/job-bill-section.tsx");
  assert.match(bill, /The money arrived/);
  assert.match(bill, /It hasn&apos;t arrived/);
});

test("revenue metrics never count claims", () => {
  for (const f of [
    "src/lib/operating-metrics.ts",
    "src/lib/ask-answer.ts",
    "src/lib/company-scoreboard.ts",
    "src/lib/portfolio.ts",
    "src/lib/shop-outcomes.ts",
    "src/lib/shift-timeline.ts",
    "src/lib/record-view.ts",
    "src/lib/tech-app.ts",
  ]) {
    const src = read(f);
    assert.match(src, /COLLECTED_STATUSES/, f);
    assert.doesNotMatch(src, /status: \{ notIn: \["failed", "refunded"\] \}|status: \{ not: "refunded" \}/, f);
  }
});

test("the jobs list reads the job's own bill, not just the estimate's", () => {
  const f = jobRowFacts(
    { ...base, finalAmountCents: 48000, invoices: [{ amountCents: 48000, status: "sent", sentAt: "2026-09-24T13:00:00Z", payments: [{ amountCents: 48000, status: "claimed" }] }] },
    now,
  );
  assert.equal(f.money.kind, "claimed");
  const work = read("src/lib/work.ts");
  assert.match(work, /Confirm \$\{who\}'s \$\{figure\} payment arrived/);
  const queue = read("src/lib/attention-queue.ts");
  assert.match(queue, /Confirm payment/);
});

test("preview and the scripted demo say what they are and keep to the launch trades", () => {
  const preview = read("src/app/api/preview/route.ts");
  assert.match(preview, /!isLaunchTrade\(body\.trade\)[\s\S]{0,80}NOT_YET_TRADE/);
  const browser = read("src/components/talk-in-browser.tsx");
  assert.match(browser, /isLaunchTrade\(trade\) \? null[\s\S]{0,120}can&apos;t sign up yet/);
  const watch = read("src/app/watch/page.tsx");
  assert.doesNotMatch(watch, /real calls/i);
  assert.match(watch, /scripted/);
});

test("the terms name every launch trade", async () => {
  const { company } = await import("../src/lib/company.ts");
  assert.deepEqual(company.trades.map((t) => t.toLowerCase()), LAUNCH_TRADES.map((t) => t.toLowerCase()));
});

test("every sitemap page names itself as canonical, and nothing inherits the homepage's", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /canonical/);
  assert.match(read("src/app/page.tsx"), /canonical: "\/"/);
  for (const p of ["watch", "launch", "calls", "try", "product", "enterprise", "pricing", "resources", "help", "pilot", "about", "security", "status", "changelog", "legal", "terms", "privacy", "cookies", "sms-terms", "refunds", "dmca"]) {
    assert.match(read(`src/app/${p}/page.tsx`), new RegExp(`canonical: "/${p}"`), p);
  }
  assert.match(read("src/app/help/[slug]/page.tsx"), /canonical: `\/help\/\$\{article\.slug\}`/);
  const config = read("next.config.ts");
  assert.match(config, /source: "\/press", destination: "\/about", permanent: true/);
  assert.match(config, /appliance-repair\)", destination: "\/trades"/);
});

test("a card says it is in the bank only when a paid payout contains the charge", async () => {
  const { cardBankFacts, chargeFromSession, bankDay, stripeSessionId } = await import("../src/lib/card-bank.ts");
  assert.equal(stripeSessionId("stripe:cs_test_a1b2"), "cs_test_a1b2");
  assert.equal(stripeSessionId("cash"), null);
  const charge = chargeFromSession({
    payment_intent: { latest_charge: { id: "ch_1", balance_transaction: { available_on: 1_761_177_600, status: "available" } } },
  });
  assert.equal(charge?.chargeId, "ch_1");
  assert.deepEqual(cardBankFacts(charge, [{ arrivalDate: 1_761_264_000, chargeIds: ["ch_1"] }]), {
    inBankOn: 1_761_264_000,
    paysOutOn: null,
    waitingOnPayout: false,
  });
  assert.deepEqual(cardBankFacts({ chargeId: "ch_1", availableOn: 1_761_177_600, status: "pending" }, []), {
    inBankOn: null,
    paysOutOn: 1_761_177_600,
    waitingOnPayout: false,
  });
  assert.equal(cardBankFacts({ chargeId: "ch_1", availableOn: 1_761_177_600, status: "available" }, []).waitingOnPayout, true);
  assert.equal(bankDay(Date.parse("2026-10-23T00:00:00Z") / 1000, new Date("2026-10-22T12:00:00Z")), "Oct 23");
  assert.equal(chargeFromSession({ payment_intent: "pi_1" }), null);
});

test("pricing and the Terms say Orvius is for U.S. businesses only", () => {
  assert.match(read("src/lib/company.ts"), /serviceCountry: "the United States"/);
  assert.match(read("src/app/pricing/page.tsx"), /For businesses in \{company\.serviceCountry\} only/);
  assert.match(read("src/app/terms/page.tsx"), /offered only to businesses located and operating in \{company\.serviceCountry\}/);
});
