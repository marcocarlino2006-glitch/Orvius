/*
 * What the owner is told matches what happened: refunds are recorded against
 * the receipt and every total shows gross, refunded and kept from one
 * calculation; a refund never reopens a bill; saved settings are not called
 * applied until the voice provider echoes them, and applying them never
 * touches the phone line; a write whose result is unknown says so; and owner
 * alerts are ready only after one actually reached the owner. No providers:
 * the voice provider is a stubbed fetch and phone-line work is counted, not done.
 */
import { mock, test, after } from "node:test";
import assert from "node:assert/strict";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "VAPI_API_KEY"]) {
  delete process.env[key];
}

const nextServer = await import("next/server");
const deferred = [];
mock.module("next/server", { namedExports: { ...nextServer, after: (task) => deferred.push(task) } });
async function drain() {
  while (deferred.length) await deferred.shift()();
}
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});
const lineWork = [];
const twilioPhoneUrl = new URL("../src/lib/twilio-phone.ts", import.meta.url).href;
const vapiLineUrl = new URL("../src/lib/vapi-line.ts", import.meta.url).href;
const twilioPhone = await import(twilioPhoneUrl);
const vapiLine = await import(vapiLineUrl);
mock.module(twilioPhoneUrl, {
  namedExports: {
    ...twilioPhone,
    configureSmsWebhook: async (phone) => void lineWork.push(`configureSmsWebhook ${phone}`),
    purchaseLocalNumber: async () => {
      lineWork.push("purchaseLocalNumber");
      throw new Error("no purchases in tests");
    },
  },
});
mock.module(vapiLineUrl, { namedExports: { ...vapiLine, attachAssistantToShopLine: async (p) => void lineWork.push(`attach ${p.phone}`) } });

const { prisma } = await import("../src/lib/prisma.ts");
const { moneyTotals, refundedOf, addTotals } = await import("../src/lib/payment-math.ts");
const { applyChargeRefund } = await import("../src/lib/payment-refund.ts");
const { getShopOutcomes } = await import("../src/lib/shop-outcomes.ts");
const { buildOwnerReport, reportCsv } = await import("../src/lib/owner-report.ts");
const { paidDepositCents } = await import("../src/lib/invoice-tax.ts");
const { buildOutcome } = await import("../src/lib/outcome.ts");
const { receptionistApplyStatus, applyReceptionistSettings, recordLiveMatch, assistantFingerprint } = await import("../src/lib/assistant-apply.ts");
const { writeErrorFor, sendWrite, serialQueue, isUncertain, UNCERTAIN_WRITE, UNREADABLE_REPLY } = await import("../src/lib/client-write.ts");
const { loadCapabilities } = await import("../src/lib/capabilities.ts");
const { ensureDemoWorkspace } = await import("../src/lib/demo-workspace.ts");
const accountRoute = await import("../src/app/api/account/route.ts");
const syncRoute = await import("../src/app/api/account/sync-assistant/route.ts");
const rulesRoute = await import("../src/app/api/account/receptionist-rules/route.ts");
const askRoute = await import("../src/app/api/command/ask/route.ts");
const copilotRoute = await import("../src/app/api/copilot/route.ts");

const created = [];
after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const req = (method, url, body) => new Request(`http://local.test${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
async function call(fn) {
  const res = await fn();
  const body = await res.json().catch(() => null);
  await drain();
  return { status: res.status, body };
}

async function shop(data = {}) {
  const ownerEmail = `truth-${uid()}@example.test`;
  const row = await prisma.business.create({
    data: {
      name: "Truth HVAC",
      slug: `truth-${uid()}`,
      environment: "production",
      trade: "HVAC",
      timezone: "America/Chicago",
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail,
      ownerPhone: "+13125550100",
      stripeConnectAccountId: `acct_${uid()}`,
      hoursJson: JSON.stringify(Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => [d, { open: "08:00", close: "17:00" }]))),
      ...data,
    },
  });
  created.push(row.id);
  signedInAs = ownerEmail;
  return row;
}

/** A $300 bill paid $100 cash and $200 by card session `session`. */
async function paidBill(s, { cash = 10_000, card = 20_000, status = "paid" } = {}) {
  const job = await prisma.job.create({ data: { businessId: s.id, title: "AC repair", status: "completed", completedAt: new Date(), finalAmountCents: cash + card } });
  const invoice = await prisma.invoice.create({ data: { businessId: s.id, jobId: job.id, amountCents: cash + card, status, paidAt: new Date(), sentAt: new Date(), publicToken: `tok-${uid()}` } });
  const session = `cs_${uid()}`;
  if (cash) await prisma.payment.create({ data: { businessId: s.id, invoiceId: invoice.id, amountCents: cash, status: "recorded", method: "cash" } });
  const cardRow = await prisma.payment.create({ data: { businessId: s.id, invoiceId: invoice.id, amountCents: card, status: "succeeded", method: `stripe:${session}` } });
  return { job, invoice, session, cardRow };
}

const cardRefund = (s, bill, cents, full = false, extra = {}) => ({
  metadata: { businessId: s.id, kind: "invoice_pay", invoiceId: bill.invoice.id },
  amountRefundedCents: cents,
  fullyRefunded: full,
  chargeId: `ch_${bill.session}`,
  paymentIntentId: `pi_${bill.session}`,
  sessionId: bill.session,
  account: s.stripeConnectAccountId,
  ...extra,
});
const openExceptions = (s) => prisma.reconciliationException.findMany({ where: { businessId: s.id, status: "open" } });
const reasonOf = (e) => JSON.parse(e.observedJson ?? "{}").reason;

/* ------------------------------ money ------------------------------ */

test("one calculation: gross is receipts, refunded is capped per receipt, a legacy refunded row gave back all of it, claims never count", () => {
  const rows = [
    { amountCents: 10_000, status: "recorded" },
    { amountCents: 20_000, status: "succeeded", refundedCents: 5_000 },
    { amountCents: 4_000, status: "refunded", refundedCents: 0 },
    { amountCents: 3_000, status: "succeeded", refundedCents: 99_999 },
    { amountCents: 7_000, status: "claimed", refundedCents: 7_000 },
    { amountCents: 2_000, status: "failed" },
  ];
  assert.deepEqual(moneyTotals(rows), { grossCents: 37_000, refundedCents: 12_000, netCents: 25_000 });
  assert.equal(refundedOf({ amountCents: 500, status: "succeeded", refundedCents: -10 }), 0);
  assert.deepEqual(addTotals(moneyTotals(rows), moneyTotals([{ amountCents: 1_000, status: "paid" }])), { grossCents: 38_000, refundedCents: 12_000, netCents: 26_000 });
  assert.deepEqual(moneyTotals(null), { grossCents: 0, refundedCents: 0, netCents: 0 });
});

/** Kept money as every owner-facing caller computes it: shop outcomes, the owner report and the job's payment stage. */
async function keptEverywhere(s, jobId) {
  const outcomes = await getShopOutcomes(s.id);
  const { report } = await buildOwnerReport(s.id, "this_month");
  const outcome = await buildOutcome(s.id, { jobId });
  return { outcomes: outcomes.money, report: report.money, reportCollected: report.collectedCents, stage: outcome.money };
}

test("$100 cash + $200 card, Stripe's running refund total $50 then $200: $300 gross, $250 then $100 kept, in every owner-facing total", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  const start = await keptEverywhere(s, bill.job.id);
  assert.deepEqual(start.outcomes, { grossCents: 30_000, refundedCents: 0, netCents: 30_000 });

  assert.deepEqual(await applyChargeRefund(cardRefund(s, bill, 5_000)), { applied: "invoice", id: bill.invoice.id, full: false });
  await applyChargeRefund(cardRefund(s, bill, 5_000));
  await applyChargeRefund(cardRefund(s, bill, 3_000));
  const card = await prisma.payment.findUnique({ where: { id: bill.cardRow.id } });
  assert.deepEqual([card.amountCents, card.refundedCents, card.status], [20_000, 5_000, "succeeded"], "the receipt stays; the running total is recorded once, and a late smaller one is old news");
  const mid = await keptEverywhere(s, bill.job.id);
  const fifty = { grossCents: 30_000, refundedCents: 5_000, netCents: 25_000 };
  assert.deepEqual(mid.outcomes, fifty);
  assert.deepEqual(mid.report, fifty);
  assert.equal(mid.reportCollected, 25_000);
  assert.deepEqual([mid.stage.refundedCents, mid.stage.keptCents], [5_000, 25_000]);
  assert.equal((await prisma.invoice.findUnique({ where: { id: bill.invoice.id } })).status, "paid", "a partial refund changes no status (standing contract)");

  assert.deepEqual(await applyChargeRefund(cardRefund(s, bill, 20_000, true)), { applied: "invoice", id: bill.invoice.id, full: true });
  await applyChargeRefund(cardRefund(s, bill, 20_000, true));
  await applyChargeRefund(cardRefund(s, bill, 5_000));
  const end = await keptEverywhere(s, bill.job.id);
  const all = { grossCents: 30_000, refundedCents: 20_000, netCents: 10_000 };
  assert.deepEqual(end.outcomes, all, "$200 is Stripe's running total, not a second $200 on top of the $50");
  assert.deepEqual(end.report, all);
  assert.deepEqual([end.stage.refundedCents, end.stage.keptCents], [20_000, 10_000]);

  const invoice = await prisma.invoice.findUnique({ where: { id: bill.invoice.id }, include: { payments: { orderBy: { createdAt: "asc" } } } });
  assert.equal(invoice.status, "partial", "standing contract: the refunded card share is owed again, the cash stays collected");
  assert.equal(invoice.amountCents, 30_000, "the committed bill is not rewritten");
  assert.deepEqual(invoice.payments.map((p) => [p.method.split(":")[0], p.amountCents, p.status, p.refundedCents]), [["cash", 10_000, "recorded", 0], ["stripe", 20_000, "refunded", 20_000]]);
  assert.equal((await openExceptions(s)).length, 0);
  const audits = await prisma.auditEvent.findMany({ where: { businessId: s.id, action: { in: ["invoice.refunded", "invoice.partially_refunded"] } } });
  assert.equal(audits.length, 2, "one record per distinct running total");
});

test("a full refund arriving before the partial one: the partial changes nothing", async () => {
  const s = await shop();
  const bill = await paidBill(s, { cash: 0, card: 20_000 });
  const full = await applyChargeRefund(cardRefund(s, bill, 20_000, true));
  assert.equal(full.applied, "invoice");
  const invoice = await prisma.invoice.findUnique({ where: { id: bill.invoice.id }, include: { payments: true } });
  assert.equal(invoice.status, "refunded", "every collected payment went back, so the bill reads refunded");
  assert.equal((await applyChargeRefund(cardRefund(s, bill, 5_000))).reason, "already_refunded");
  assert.deepEqual((await getShopOutcomes(s.id)).money, { grossCents: 20_000, refundedCents: 20_000, netCents: 0 });
});

test("a payment marked refunded before refund amounts were recorded counts as fully refunded, once", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  await prisma.payment.update({ where: { id: bill.cardRow.id }, data: { status: "refunded", refundedCents: 0 } });
  await prisma.invoice.update({ where: { id: bill.invoice.id }, data: { status: "partial" } });
  assert.deepEqual((await getShopOutcomes(s.id)).money, { grossCents: 30_000, refundedCents: 20_000, netCents: 10_000 });
  await applyChargeRefund(cardRefund(s, bill, 20_000, true));
  assert.deepEqual((await getShopOutcomes(s.id)).money, { grossCents: 30_000, refundedCents: 20_000, netCents: 10_000 }, "a later event doesn't subtract it again");
});

test("historical partial refunds known only from audit rows: backfilled from the highest running total when attributable, listed when not, idempotent", async () => {
  const { planRefundBackfill, applyRefundBackfill } = await import("./refund-backfill.mjs");
  const s = await shop();
  const single = await paidBill(s);
  const several = await paidBill(s, { cash: 0, card: 10_000 });
  await prisma.payment.create({ data: { businessId: s.id, invoiceId: several.invoice.id, amountCents: 10_000, status: "succeeded", method: "stripe:cs_second" } });
  const deposit = await prisma.deposit.create({ data: { businessId: s.id, amountCents: 5_000, status: "paid", paidAt: new Date() } });
  const legacy = (action, detail) => prisma.auditEvent.create({ data: { businessId: s.id, entityType: "shop", entityId: s.id, action, actor: "orvius", summary: "legacy", detailJson: JSON.stringify(detail) } });
  await legacy("invoice.partially_refunded", { invoiceId: single.invoice.id, chargeId: "ch_old", amountRefundedCents: 3_000 });
  await legacy("invoice.partially_refunded", { invoiceId: single.invoice.id, chargeId: "ch_old", amountRefundedCents: 7_000 });
  await legacy("invoice.partially_refunded", { invoiceId: several.invoice.id, chargeId: "ch_amb", amountRefundedCents: 2_000 });
  await legacy("deposit.partially_refunded", { depositId: deposit.id, chargeId: "ch_dep_old", amountRefundedCents: 1_000 });

  const plan = await planRefundBackfill(prisma, { businessId: s.id });
  assert.deepEqual(plan.apply.map((a) => [a.table, a.id, a.cents]).sort(), [["deposit", deposit.id, 1_000], ["payment", single.cardRow.id, 7_000]].sort(), "highest running total per charge, not 3,000 + 7,000");
  assert.deepEqual(plan.ambiguous.map((a) => [a.chargeId, a.why]), [["ch_amb", "several_card_receipts"]]);
  assert.equal(await applyRefundBackfill(prisma, plan), 2);
  assert.deepEqual((await getShopOutcomes(s.id)).money, { grossCents: 55_000, refundedCents: 8_000, netCents: 47_000 });
  const again = await planRefundBackfill(prisma, { businessId: s.id });
  assert.equal(again.apply.length, 0);
  assert.equal(again.skipped.length, 2);
});

test("two refund events at once: the higher running total wins, whichever lands last", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  await Promise.all([applyChargeRefund(cardRefund(s, bill, 8_000)), applyChargeRefund(cardRefund(s, bill, 5_000))]);
  assert.equal((await prisma.payment.findUnique({ where: { id: bill.cardRow.id } })).refundedCents, 8_000);
});

test("a refund event not from the shop's own connected account changes nothing", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  for (const account of ["acct_someone_else", null, undefined]) {
    const out = await applyChargeRefund(cardRefund(s, bill, 20_000, true, { account }));
    assert.equal(out.reason, "not_ours", String(account));
  }
  const unconnected = await shop({ stripeConnectAccountId: null });
  const other = await paidBill(unconnected);
  assert.equal((await applyChargeRefund(cardRefund(unconnected, other, 20_000, true, { account: "acct_x" }))).reason, "not_ours");
  assert.equal((await prisma.payment.findUnique({ where: { id: bill.cardRow.id } })).refundedCents, 0);
  assert.equal((await openExceptions(s)).length, 0);
});

test("a refund of a duplicate charge Orvius never recorded changes nothing and raises nothing", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  const out = await applyChargeRefund(cardRefund(s, bill, 20_000, true, { sessionId: "cs_duplicate" }));
  assert.equal(out.reason, "duplicate_charge");
  assert.equal((await openExceptions(s)).length, 0);
  assert.equal((await getShopOutcomes(s.id)).collectedCents, 30_000);
});

test("a deposit refunded after the bill went out: the bill is left as the customer has it and the question goes to Command", async () => {
  const s = await shop();
  const lead = await prisma.lead.create({ data: { businessId: s.id, name: "Rosa Diaz", phone: "+13125550147", status: "booked" } });
  const job = await prisma.job.create({ data: { businessId: s.id, leadId: lead.id, title: "AC", status: "completed", finalAmountCents: 42_000 } });
  const deposit = await prisma.deposit.create({ data: { businessId: s.id, leadId: lead.id, amountCents: 5_000, status: "paid", paidAt: new Date(), stripePaymentIntentId: "pi_dep" } });
  const invoice = await prisma.invoice.create({ data: { businessId: s.id, jobId: job.id, amountCents: 37_000, status: "sent", sentAt: new Date(), publicToken: `tok-${uid()}` } });
  const input = { metadata: { businessId: s.id, kind: "booking_deposit", depositId: deposit.id }, chargeId: "ch_dep", paymentIntentId: "pi_dep", account: s.stripeConnectAccountId };

  assert.equal(await paidDepositCents(s.id, job.id), 5_000);
  const partial = await applyChargeRefund({ ...input, amountRefundedCents: 2_000, fullyRefunded: false });
  assert.deepEqual(partial, { applied: "deposit", id: deposit.id, full: false });
  const afterPartial = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  assert.deepEqual([afterPartial.status, afterPartial.refundedCents, afterPartial.amountCents], ["paid", 2_000, 5_000]);

  const full = await applyChargeRefund({ ...input, amountRefundedCents: 5_000, fullyRefunded: true });
  assert.equal(full.applied, "deposit");
  assert.equal((await applyChargeRefund({ ...input, amountRefundedCents: 5_000, fullyRefunded: true })).reason, "already_refunded");
  const bill = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  assert.deepEqual([bill.amountCents, bill.status], [37_000, "sent"], "the committed bill is not rewritten");
  const exceptions = await openExceptions(s);
  assert.ok(exceptions.length >= 1 && exceptions.every((e) => reasonOf(e) === "deposit_refunded_after_billing"));
  assert.deepEqual((await getShopOutcomes(s.id)).money, { grossCents: 5_000, refundedCents: 5_000, netCents: 0 });

  const wrongCharge = await applyChargeRefund({ ...input, paymentIntentId: "pi_other", amountRefundedCents: 5_000, fullyRefunded: true });
  assert.equal(wrongCharge.reason, "duplicate_charge");
});

test("a deposit refunded before billing comes off what the next bill credits", async () => {
  const s = await shop();
  const job = await prisma.job.create({ data: { businessId: s.id, title: "AC", status: "scheduled" } });
  const deposit = await prisma.deposit.create({ data: { businessId: s.id, jobId: job.id, amountCents: 5_000, status: "paid", paidAt: new Date(), stripePaymentIntentId: "pi_d2" } });
  await applyChargeRefund({ metadata: { businessId: s.id, kind: "booking_deposit", depositId: deposit.id }, chargeId: "ch_d2", paymentIntentId: "pi_d2", amountRefundedCents: 1_500, fullyRefunded: false, account: s.stripeConnectAccountId });
  assert.equal(await paidDepositCents(s.id, job.id), 3_500);
  assert.equal((await openExceptions(s)).length, 0, "no bill yet, so nothing to decide");
});

test("the owner report and the job's payment stage show what was kept, and say so", async () => {
  const s = await shop();
  const bill = await paidBill(s);
  await applyChargeRefund(cardRefund(s, bill, 5_000));
  const { report } = await buildOwnerReport(s.id, "this_month");
  assert.equal(report.collectedCents, 25_000);
  assert.deepEqual(report.money, { grossCents: 30_000, refundedCents: 5_000, netCents: 25_000 });
  const csv = reportCsv(report);
  assert.match(csv, /Kept after refunds/);
  assert.match(csv, /Refunded/);
  const outcome = await buildOutcome(s.id, { jobId: bill.job.id });
  const payment = outcome.stages.find((st) => st.stage === "payment");
  assert.match(JSON.stringify(payment), /refunded/i);
  assert.match(JSON.stringify(payment), /kept/i);
});

test("the refund-ledger release only adds two defaulted columns: old rows read 0, old-style inserts still work, a second run changes nothing", async () => {
  const { readFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createClient } = await import("@libsql/client");
  const { applyMigrationPlan, splitStatements, migrationPlanSha256 } = await import("./turso-migrate.mjs");
  const sql = readFileSync(new URL("../prisma/releases/2026-10-17-refund-ledger.sql", import.meta.url), "utf8");
  const statements = splitStatements(sql);
  assert.deepEqual(statements, [
    'ALTER TABLE "Payment" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "Deposit" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0',
  ]);
  const dir = mkdtempSync(join(tmpdir(), "refund-ledger-"));
  const client = createClient({ url: `file:${join(dir, "disposable.db")}` });
  try {
    await client.executeMultiple(`CREATE TABLE "Payment" ("id" TEXT PRIMARY KEY, "amountCents" INTEGER NOT NULL, "status" TEXT NOT NULL);
      CREATE TABLE "Deposit" ("id" TEXT PRIMARY KEY, "amountCents" INTEGER NOT NULL, "status" TEXT NOT NULL);
      INSERT INTO "Payment" VALUES ('p1', 20000, 'succeeded'), ('p2', 5000, 'refunded');
      INSERT INTO "Deposit" VALUES ('d1', 5000, 'paid');`);
    const tuple = { sql, planFile: "prisma/releases/2026-10-17-refund-ledger.sql", planSha256: migrationPlanSha256(sql), release: "rehearsal", target: "staging", host: "disposable", approval: "TEST", backupRef: "none-disposable" };
    await applyMigrationPlan(client, tuple);
    const rows = async () => (await client.execute(`SELECT "id","amountCents","status","refundedCents" FROM "Payment" UNION ALL SELECT "id","amountCents","status","refundedCents" FROM "Deposit" ORDER BY 1`)).rows.map((r) => ({ ...r }));
    const first = await rows();
    assert.deepEqual(first, [
      { id: "d1", amountCents: 5000, status: "paid", refundedCents: 0 },
      { id: "p1", amountCents: 20000, status: "succeeded", refundedCents: 0 },
      { id: "p2", amountCents: 5000, status: "refunded", refundedCents: 0 },
    ]);
    assert.deepEqual(moneyTotals(first.filter((r) => r.id.startsWith("p"))), { grossCents: 25_000, refundedCents: 5_000, netCents: 20_000 }, "a legacy refunded row still counts as given back");
    await client.execute(`INSERT INTO "Payment" ("id","amountCents","status") VALUES ('p3', 100, 'succeeded')`);
    await applyMigrationPlan(client, tuple);
    assert.equal((await rows()).length, 4);
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------ settings ------------------------------ */

/** The voice provider: each assistant PATCH gets the next scripted reply; the last repeats. */
function voiceProvider(replies) {
  const realFetch = globalThis.fetch;
  process.env.VAPI_API_KEY = "test-not-a-key";
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(`${init.method ?? "GET"} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
    if (/\/assistant\//.test(u) && init.method === "PATCH") {
      const reply = replies[Math.min(n++, replies.length - 1)];
      if (reply === "fail") return new Response("bad gateway", { status: 502 });
      if (reply === "throw") throw new TypeError("fetch failed");
      if (reply === "no-echo") return Response.json({ id: "asst" });
      if (reply === "wrong-echo") return Response.json({ id: "asst", metadata: { orviusConfig: "something-else" } });
      return Response.json({ id: "asst", metadata: JSON.parse(init.body ?? "{}").metadata ?? {} });
    }
    if (/phone-number/.test(u)) lineWork.push(`vapi ${init.method ?? "GET"} phone-number`);
    return Response.json([]);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = realFetch;
      delete process.env.VAPI_API_KEY;
    },
  };
}

const liveShop = (data = {}) => shop({ vapiAssistantId: `asst_${uid()}`, twilioPhone: "+13125550188", vapiPhoneNumber: "+13125550188", greeting: "Thanks for calling.", ...data });

test("applied only when the provider echoes these exact settings; a refusal, an error, no echo or a wrong echo is not applied", async () => {
  for (const [reply, expected] of [["echo", "applied"], ["fail", "failed"], ["throw", "failed"], ["no-echo", "failed"], ["wrong-echo", "failed"]]) {
    const s = await liveShop();
    const vapi = voiceProvider([reply]);
    try {
      const result = await applyReceptionistSettings(s, { actor: "owner", email: s.ownerEmail });
      assert.equal(result.state, expected, reply);
      assert.equal((await receptionistApplyStatus(s)).state, expected, `${reply}, read back`);
      if (expected !== "applied") assert.ok(result.next && result.canApply, "there is a next step");
      if (reply === "fail") assert.equal(result.error, "The voice provider refused the change (error 502).", "the owner sees a sentence, not the provider's raw reply");
    } finally {
      vapi.restore();
    }
  }
});

test("no record for the current settings reads as unconfirmed, and an old success for different settings doesn't count", async () => {
  const s = await liveShop();
  assert.equal((await receptionistApplyStatus(s)).state, "unconfirmed");
  const vapi = voiceProvider(["echo"]);
  try {
    assert.equal((await applyReceptionistSettings(s)).state, "applied");
  } finally {
    vapi.restore();
  }
  const changed = await prisma.business.update({ where: { id: s.id }, data: { greeting: "A different greeting." } });
  assert.notEqual(assistantFingerprint(changed), assistantFingerprint(s));
  assert.equal((await receptionistApplyStatus(changed)).state, "unconfirmed");
  await recordLiveMatch(changed, assistantFingerprint(changed));
  await recordLiveMatch(changed, assistantFingerprint(changed));
  assert.equal((await receptionistApplyStatus(changed)).state, "applied", "a live check that found these settings is the same evidence");
  assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, summary: { startsWith: "Receptionist checked" } } }), 1, "one row a day per version");
});

test("a later failure for the same settings outranks an earlier success", async () => {
  const s = await liveShop();
  const vapi = voiceProvider(["echo", "fail"]);
  try {
    await applyReceptionistSettings(s);
    await new Promise((r) => setTimeout(r, 5));
    await applyReceptionistSettings(s);
  } finally {
    vapi.restore();
  }
  assert.equal((await receptionistApplyStatus(s)).state, "failed");
});

test("the provider took it but the record couldn't be written: unconfirmed, never applied", async () => {
  const s = await liveShop();
  const vapi = voiceProvider(["echo"]);
  const original = prisma.auditEvent.create;
  prisma.auditEvent.create = async () => {
    throw new Error("database unavailable");
  };
  try {
    const result = await applyReceptionistSettings(s);
    assert.equal(result.state, "unconfirmed");
    assert.match(result.next, /couldn't record/);
  } finally {
    prisma.auditEvent.create = original;
    vapi.restore();
  }
  assert.equal((await receptionistApplyStatus(s)).state, "unconfirmed");
});

test("demo shops and shops without a receptionist are not applicable, and no provider is called", async () => {
  const email = `truth-demo-${uid()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  created.push(business.id);
  const plain = await shop();
  const vapi = voiceProvider(["echo"]);
  try {
    assert.equal((await applyReceptionistSettings(business)).state, "not_applicable");
    assert.equal((await applyReceptionistSettings(plain)).state, "not_applicable");
    assert.equal(vapi.calls.length, 0);
  } finally {
    vapi.restore();
  }
});

test("Settings: a refused greeting is saved, shown as not applied, still shown after reload, and the retry re-sends settings without touching the line", async () => {
  const s = await liveShop();
  const vapi = voiceProvider(["fail", "echo"]);
  const before = lineWork.length;
  try {
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", { greeting: "Truth HVAC, how can we help?" })));
    assert.equal(save.status, 200);
    assert.equal(save.body.saved, true);
    assert.equal(save.body.business.greeting, "Truth HVAC, how can we help?", "the canonical saved value comes back");
    assert.equal(save.body.receptionistApply.state, "failed");
    assert.equal(save.body.assistantSynced, false);

    const reload = await call(() => accountRoute.GET(req("GET", "/api/account")));
    assert.equal(reload.body.receptionistApply.state, "failed", "the miss survives a reload");
    assert.match(reload.body.receptionistApply.next, /saved/i);

    const retry = await call(() => syncRoute.POST());
    assert.equal(retry.status, 200);
    assert.equal(retry.body.receptionistApply.state, "applied");
    assert.equal((await call(() => accountRoute.GET(req("GET", "/api/account")))).body.receptionistApply.state, "applied");
    assert.deepEqual(lineWork.slice(before), [], "neither the save nor the retry touched the phone line");
    assert.ok(vapi.calls.every((c) => /^PATCH \/assistant\//.test(c)), `only the assistant was called: ${vapi.calls}`);
  } finally {
    vapi.restore();
  }
});

test("Settings: a save that doesn't touch the receptionist doesn't call the provider, and reports the standing state", async () => {
  const s = await liveShop();
  const vapi = voiceProvider(["echo"]);
  try {
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", { autopilot: true })));
    assert.equal(save.status, 200);
    assert.equal(vapi.calls.length, 0);
    assert.equal(save.body.receptionistApply.state, "unconfirmed", "nothing on record for these settings yet");
    assert.equal(save.body.assistantSynced, true, "nothing the receptionist uses changed");
  } finally {
    vapi.restore();
  }
  assert.ok(s);
});

test("Settings: a shop without a line is not given one by a settings save or by the retry", async () => {
  await liveShop({ twilioPhone: null, vapiPhoneNumber: null });
  const vapi = voiceProvider(["echo"]);
  const before = lineWork.length;
  const attempts = await prisma.provisionAttempt.count();
  try {
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", { greeting: "Hello there." })));
    assert.equal(save.body.receptionistApply.state, "applied");
    const retry = await call(() => syncRoute.POST());
    assert.equal(retry.status, 200);
  } finally {
    vapi.restore();
  }
  assert.deepEqual(lineWork.slice(before), []);
  assert.equal(await prisma.provisionAttempt.count(), attempts, "no provisioning attempt was claimed");
});

test("Receptionist corrections: synced is true only with the provider's echo", async () => {
  const s = await liveShop();
  for (const [reply, synced] of [["no-echo", false], ["echo", true]]) {
    const vapi = voiceProvider([reply]);
    try {
      const added = await call(() => rulesRoute.POST(req("POST", "/api/account/receptionist-rules", { text: `Always ask for the gate code ${reply}` })));
      assert.equal(added.status, 200, JSON.stringify(added.body));
      assert.equal(added.body.synced, synced, reply);
      assert.equal(added.body.receptionistApply.state, synced ? "applied" : "failed");
    } finally {
      vapi.restore();
    }
  }
  assert.ok(s);
});

/* ------------------------------ uncertain writes ------------------------------ */

test("client writes: a refusal is certain; no answer, a server error or an unreadable reply is uncertain and never says nothing changed", async () => {
  assert.equal(writeErrorFor(400, { error: "Pick a time." }).uncertain, false);
  assert.equal(writeErrorFor(409, { error: "Already booked." }).message, "Already booked.");
  const e500 = writeErrorFor(500, { error: "Something broke." });
  assert.equal(e500.uncertain, true);
  assert.match(e500.message, /may or may not have gone through/);
  assert.equal(writeErrorFor(502, null).message, UNCERTAIN_WRITE);
  assert.equal(writeErrorFor(408, {}).uncertain, true);
  assert.equal(writeErrorFor(500, { error: "Not sent.", reason: "failed_before_effect" }).uncertain, false);
  assert.equal(writeErrorFor(500, { error: "This may have run." }).message, "This may have run.", "no double hedge");

  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    await assert.rejects(sendWrite("/x", "POST", {}), (e) => isUncertain(e) && e.message === UNCERTAIN_WRITE);
    globalThis.fetch = async () => new Response("<html>", { status: 200 });
    await assert.rejects(sendWrite("/x", "POST", {}), (e) => isUncertain(e) && e.message === UNREADABLE_REPLY);
    globalThis.fetch = async () => Response.json({ error: "No." }, { status: 403 });
    await assert.rejects(sendWrite("/x", "POST", {}), (e) => !isUncertain(e) && e.message === "No.");
    globalThis.fetch = async () => Response.json({ ok: true });
    assert.deepEqual(await sendWrite("/x", "POST", {}), { ok: true });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("serial saves: a slow earlier save finishes before a later one starts, and a failure doesn't stall the queue", async () => {
  const enqueue = serialQueue();
  const order = [];
  const slow = enqueue(async () => {
    await new Promise((r) => setTimeout(r, 30));
    order.push("first");
    throw new Error("first failed");
  });
  const fast = enqueue(async () => {
    order.push("second");
    return "ok";
  });
  await assert.rejects(slow, /first failed/);
  assert.equal(await fast, "ok");
  assert.deepEqual(order, ["first", "second"]);
});

test("Command: a plan that may have run says so, and is not run again", async () => {
  const email = `truth-cmd-${uid()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  created.push(business.id);
  await prisma.business.update({ where: { id: business.id }, data: { autopilot: true } });
  signedInAs = email;
  await prisma.lead.create({ data: { businessId: business.id, name: "Rosa Diaz", phone: "+13125550147", serviceType: "AC not cooling", address: "702 Main St, Evanston IL 60202", status: "new" } });
  const ask = await call(() => askRoute.POST(req("POST", "/api/command/ask", { text: "Book Rosa Diaz in the next suitable window and assign an available qualified technician" })));
  assert.equal(ask.body?.kind, "proposal", JSON.stringify(ask.body));
  const original = prisma.copilotAction.findUniqueOrThrow;
  prisma.copilotAction.findUniqueOrThrow = async () => {
    throw new Error("connection reset");
  };
  let first;
  try {
    first = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=execute", { proposalId: ask.body.proposal.proposalId, approved: true })));
  } finally {
    prisma.copilotAction.findUniqueOrThrow = original;
  }
  assert.equal(first.status, 500);
  assert.equal(first.body.reason, "unknown");
  assert.match(first.body.error, /couldn't tell whether this ran/);
  assert.doesNotMatch(first.body.error, /nothing (was )?changed/i);
  const again = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=execute", { proposalId: ask.body.proposal.proposalId, approved: true })));
  assert.notEqual(again.status, 200, "approving again doesn't run it a second time");
});

/* ------------------------------ activation ------------------------------ */

test("owner alerts: a phone on file is not delivery; ready after a delivered text or accepted email, pending again after a later failure", async () => {
  const s = await shop();
  const alerts = async () => (await loadCapabilities(s.id)).find((c) => c.id === "owner_alerts");
  let a = await alerts();
  assert.equal(a.state, "pending");
  assert.match(a.detail, /Nothing has reached you yet/);

  await prisma.ownerNotification.create({ data: { businessId: s.id, channel: "sms", dedupeKey: "a1", status: "sent", deliveryStatus: "queued" } });
  assert.equal((await alerts()).state, "pending", "accepted by Twilio is not delivered");
  await prisma.ownerNotification.create({ data: { businessId: s.id, channel: "sms", dedupeKey: "a2", status: "sent", deliveryStatus: "delivered" } });
  a = await alerts();
  assert.equal(a.state, "ready");
  assert.match(a.detail, /carrier receipt/);

  await new Promise((r) => setTimeout(r, 5));
  await prisma.ownerNotification.create({ data: { businessId: s.id, channel: "sms", dedupeKey: "a3", status: "failed" } });
  assert.equal((await alerts()).state, "pending");
  await new Promise((r) => setTimeout(r, 5));
  await prisma.ownerNotification.create({ data: { businessId: s.id, channel: "email", dedupeKey: "a4", status: "sent" } });
  assert.match((await alerts()).detail, /accepted by the mail provider/);

  const unreachable = await shop({ ownerPhone: null, ownerEmail: null });
  assert.match((await loadCapabilities(unreachable.id)).find((c) => c.id === "owner_alerts").detail, /No mobile number or email/);
});

test("test-mode shops: every capability that reads as on is marked simulated, and alerts are never ready", async () => {
  const s = await shop({ environment: "test" });
  await prisma.ownerNotification.create({ data: { businessId: s.id, channel: "sms", dedupeKey: "t1", status: "sent", deliveryStatus: "delivered" } });
  const caps = await loadCapabilities(s.id);
  assert.deepEqual(caps.map((c) => c.id), ["voice", "owner_alerts", "sms", "booking", "follow_ups", "payments"]);
  for (const c of caps) if (c.state !== "off") assert.equal(c.simulated, true, c.id);
  assert.equal(caps.find((c) => c.id === "owner_alerts").state, "pending");
  const live = await loadCapabilities((await shop()).id);
  assert.ok(live.every((c) => !c.simulated));
});
