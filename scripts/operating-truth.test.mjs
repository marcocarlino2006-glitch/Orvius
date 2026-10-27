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
    ensureVoiceFallback: async () => {},
    purchaseLocalNumber: async () => {
      lineWork.push("purchaseLocalNumber");
      throw new Error("no purchases in tests");
    },
  },
});
mock.module(vapiLineUrl, { namedExports: { ...vapiLine, attachAssistantToShopLine: async (p) => void lineWork.push(`attach ${p.phone}`) } });
const housecallUrl = new URL("../src/lib/housecall.ts", import.meta.url).href;
const housecall = await import(housecallUrl);
let housecallUnreadable = false;
mock.module(housecallUrl, {
  namedExports: {
    ...housecall,
    housecallStatus: async (businessId) => {
      if (housecallUnreadable) throw new Error("database timeout");
      return housecall.housecallStatus(businessId);
    },
  },
});

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
const { readExecuteReply, readCancelReply, readReadBack, describeReadBack, isBillReply } = await import("../src/lib/plan-reply.ts");
const accountRoute = await import("../src/app/api/account/route.ts");
const syncRoute = await import("../src/app/api/account/sync-assistant/route.ts");
const rulesRoute = await import("../src/app/api/account/receptionist-rules/route.ts");
const askRoute = await import("../src/app/api/command/ask/route.ts");
const copilotRoute = await import("../src/app/api/copilot/route.ts");
const customersRoute = await import("../src/app/api/customers/route.ts");
const customerRoute = await import("../src/app/api/customers/[id]/route.ts");

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

test("Receptionist corrections: a repeated press writes nothing new, a removal replay says it's gone, and a stale window can't overwrite", async () => {
  const s = await liveShop();
  const vapi = voiceProvider(["echo"]);
  try {
    const text = "Always ask whether the dog is inside";
    const first = await call(() => rulesRoute.POST(req("POST", "/api/account/receptionist-rules", { text })));
    assert.equal(first.status, 200);
    const patchesAfterFirst = vapi.calls.filter((c) => c.startsWith("PATCH")).length;
    const audits = await prisma.auditEvent.count({ where: { businessId: s.id, action: "receptionist_rule.add" } });
    const again = await call(() => rulesRoute.POST(req("POST", "/api/account/receptionist-rules", { text })));
    assert.equal(again.status, 200);
    assert.equal(again.body.unchanged, true);
    assert.equal(again.body.rule.id, first.body.rule.id);
    assert.equal(typeof again.body.synced, "boolean", "the replay still says where the receptionist stands");
    assert.equal(vapi.calls.filter((c) => c.startsWith("PATCH")).length, patchesAfterFirst, "no second provider write");
    assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: "receptionist_rule.add" } }), audits, "no second audit");
    assert.equal(JSON.parse((await prisma.business.findUniqueOrThrow({ where: { id: s.id } })).receptionistRulesJson).length, 1);

    const removed = await call(() => rulesRoute.DELETE(req("DELETE", `/api/account/receptionist-rules?id=${first.body.rule.id}`)));
    assert.equal(removed.status, 200);
    assert.equal(typeof removed.body.synced, "boolean");
    assert.deepEqual(removed.body.rules, []);
    const replay = await call(() => rulesRoute.DELETE(req("DELETE", `/api/account/receptionist-rules?id=${first.body.rule.id}`)));
    assert.equal(replay.status, 404);
    assert.match(replay.body.error, /already gone/);

    // Another window saved between this request's read and its write: the write is refused, not merged blind.
    const realUpdateMany = prisma.business.updateMany;
    prisma.business.updateMany = async (args) => {
      prisma.business.updateMany = realUpdateMany;
      await prisma.business.update({ where: { id: s.id }, data: { receptionistRulesJson: JSON.stringify([{ id: "other01", text: "Offer the morning slot first", createdAt: new Date().toISOString() }]) } });
      return realUpdateMany.call(prisma.business, args);
    };
    const stale = await call(() => rulesRoute.POST(req("POST", "/api/account/receptionist-rules", { text: "Ask for the gate code" })));
    prisma.business.updateMany = realUpdateMany;
    assert.equal(stale.status, 409);
    assert.equal(stale.body.reason, "changed_elsewhere");
    const kept = JSON.parse((await prisma.business.findUniqueOrThrow({ where: { id: s.id } })).receptionistRulesJson);
    assert.deepEqual(kept.map((r) => r.id), ["other01"], "the other window's correction survives");
  } finally {
    vapi.restore();
  }
});

test("Settings: a save counts only with the saved record; after a lost reply the record decides", async () => {
  const { isSaveReply, recordHolds } = await import("../src/components/settings-center/settings-model.ts");
  assert.equal(isSaveReply({ business: { greeting: "Hi" } }), true);
  for (const bad of [null, {}, { business: null }, { business: [] }, { ok: true }, "ok"]) assert.equal(isSaveReply(bad), false, JSON.stringify(bad));
  assert.equal(recordHolds({ greeting: "Hi", autopilot: true }, { greeting: "Hi", autopilot: true }), "holds");
  assert.equal(recordHolds({ greeting: "Old" }, { greeting: "Hi" }), "differs");
  assert.equal(recordHolds({ greeting: "Hi" }, { secretField: 1 }), "unknown", "a field the record doesn't show is never called saved");
  assert.equal(recordHolds({ overflowForwardConfirmedAt: "2026-10-01T00:00:00Z" }, { overflowForwardConfirmedAt: true }), "holds");
  assert.equal(recordHolds({ overflowForwardConfirmedAt: null }, { overflowForwardConfirmedAt: true }), "differs");
  assert.equal(recordHolds({}, {}), "unknown");

  await liveShop();
  const vapi = voiceProvider(["echo"]);
  try {
    const sent = { greeting: "Thanks for calling Truth HVAC.", autopilot: true };
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", sent)));
    assert.equal(isSaveReply(save.body), true);
    const record = await call(() => accountRoute.GET(req("GET", "/api/account")));
    assert.equal(recordHolds(record.body.business, sent), "holds", "the read-back the screen uses confirms the save");
  } finally {
    vapi.restore();
  }
});

test("Settings: the reply carries the normalized saved values, and the screen adopts them over what was typed", async () => {
  const { mergeSaved } = await import("../src/components/settings-center/settings-model.ts");
  await liveShop();
  const vapi = voiceProvider(["echo"]);
  try {
    const typed = { transferPhone: "(312) 555-0199", greeting: "  Hello from Truth HVAC.  " };
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", typed)));
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(save.body.business.transferPhone, "+13125550199");
    assert.equal(save.body.business.greeting, "Hello from Truth HVAC.");
    const screen = mergeSaved({ transferPhone: null, greeting: "old", name: "Truth HVAC" }, typed, save.body, new Set());
    assert.deepEqual([screen.transferPhone, screen.greeting, screen.name], ["+13125550199", "Hello from Truth HVAC.", "Truth HVAC"]);
    const reopened = await call(() => accountRoute.GET(req("GET", "/api/account")));
    assert.equal(reopened.body.business.transferPhone, "+13125550199", "closing and reopening shows what was saved");
  } finally {
    vapi.restore();
  }
});

test("Settings: if the apply record can't be read, the reload says unconfirmed, never applied", async () => {
  await liveShop();
  const vapi = voiceProvider(["echo"]);
  try {
    assert.equal((await call(() => accountRoute.PATCH(req("PATCH", "/api/account", { greeting: "Recorded greeting." })))).body.receptionistApply.state, "applied");
  } finally {
    vapi.restore();
  }
  const original = prisma.auditEvent.findMany;
  prisma.auditEvent.findMany = async () => {
    throw new Error("read timeout");
  };
  try {
    const reload = await call(() => accountRoute.GET(req("GET", "/api/account")));
    assert.equal(reload.status, 200);
    assert.equal(reload.body.receptionistApply.state, "unconfirmed");
    const save = await call(() => accountRoute.PATCH(req("PATCH", "/api/account", { autopilot: false })));
    assert.equal(save.body.receptionistApply.state, "unconfirmed");
  } finally {
    prisma.auditEvent.findMany = original;
  }
});

test("Settings: a connector whose status can't be read is named in the account reply, and the others still load", async () => {
  await shop();
  const before = await call(() => accountRoute.GET(req("GET", "/api/account")));
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.integrationStatusErrors, []);
  assert.equal(before.body.housecall.status, "none");

  housecallUnreadable = true;
  try {
    const reply = await call(() => accountRoute.GET(req("GET", "/api/account")));
    assert.equal(reply.status, 200, "one unreadable connector doesn't fail the whole account");
    assert.deepEqual(reply.body.integrationStatusErrors, ["housecall"], "the unreadable one is named");
    assert.equal(reply.body.housecall, null, "and not reported as never set up");
    for (const name of ["jobber", "servicetitan", "quickbooks"]) {
      assert.equal(reply.body[name].status, "none", `${name} still reads`);
    }
  } finally {
    housecallUnreadable = false;
  }
});

test("Settings: a reply from a server without the apply field still shows a failed sync, and a plain 200 is never read as applied", async () => {
  const { applyFromReply } = await import("../src/components/settings-center/settings-model.ts");
  const failed = applyFromReply({ assistantSynced: false, syncError: "Assistant sync failed" }, null);
  assert.deepEqual([failed.state, failed.error, failed.canApply], ["failed", "Assistant sync failed", true]);
  assert.equal(applyFromReply({ assistantSynced: true }, null), null);
  const previous = { state: "unconfirmed", appliedAt: null, error: null, next: "x", canApply: true };
  assert.equal(applyFromReply({}, previous), previous);
});

test("Settings: two quick edits to the greeting through the client's save path; the slower first reply can't undo the second", async () => {
  const { mergeSaved } = await import("../src/components/settings-center/settings-model.ts");
  const s = await liveShop();
  const vapi = voiceProvider(["echo"]);
  const viaVapi = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("/api/account")) return viaVapi(url, init);
    const mine = ++n;
    const res = await accountRoute.PATCH(new Request(`http://local.test${url}`, init));
    if (mine === 1) await new Promise((r) => setTimeout(r, 40));
    await drain();
    return res;
  };
  const queue = serialQueue();
  const inLine = new Map();
  let screen = { greeting: "start", name: s.name };
  const save = (fields) => {
    const keys = Object.keys(fields);
    for (const k of keys) inLine.set(k, (inLine.get(k) ?? 0) + 1);
    return queue(async () => {
      try {
        const reply = await sendWrite("/api/account", "PATCH", fields);
        const later = new Set([...inLine].filter(([k, c]) => c > (keys.includes(k) ? 1 : 0)).map(([k]) => k));
        screen = mergeSaved(screen, fields, reply, later);
      } finally {
        for (const k of keys) inLine.set(k, inLine.get(k) - 1);
      }
    });
  };
  try {
    await Promise.all([save({ greeting: "First edit." }), save({ greeting: "Second edit." })]);
  } finally {
    globalThis.fetch = viaVapi;
    vapi.restore();
  }
  assert.equal(screen.greeting, "Second edit.");
  assert.equal((await prisma.business.findUnique({ where: { id: s.id } })).greeting, "Second edit.");
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

async function commandPlan() {
  const email = `truth-cmd-${uid()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  created.push(business.id);
  await prisma.business.update({ where: { id: business.id }, data: { autopilot: true } });
  signedInAs = email;
  const lead = await prisma.lead.create({ data: { businessId: business.id, name: "Rosa Diaz", phone: "+13125550147", serviceType: "AC not cooling", address: "702 Main St, Evanston IL 60202", status: "new" } });
  const ask = await call(() => askRoute.POST(req("POST", "/api/command/ask", { text: "Book Rosa Diaz in the next suitable window and assign an available qualified technician" })));
  assert.equal(ask.body?.kind, "proposal", JSON.stringify(ask.body));
  return { business, lead, proposalId: ask.body.proposal.proposalId };
}
const readBack = (id) => call(() => copilotRoute.GET(req("GET", `/api/copilot?proposalId=${encodeURIComponent(id)}`)));
const execute = (id) => call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=execute", { proposalId: id, approved: true })));

test("Command replies: only a reply that names this plan and says what happened counts; anything else is read back", () => {
  const good = { ok: true, proposalId: "p1", confirmation: { summary: "Booked Rosa for Tue 9am." }, outcome: { stages: [] } };
  assert.equal(readExecuteReply(good, "p1")?.summary, "Booked Rosa for Tue 9am.");
  for (const bad of [null, {}, { ok: true }, { ...good, proposalId: "p2" }, { ...good, confirmation: {} }, { ...good, confirmation: { summary: "  " } }, { ...good, ok: "true" }]) {
    assert.equal(readExecuteReply(bad, "p1"), null, JSON.stringify(bad));
  }
  assert.equal(readCancelReply({ ok: true, proposalId: "p1", status: "cancelled" }, "p1"), true);
  assert.equal(readCancelReply({ ok: true, proposalId: "p1" }, "p1"), false);
  assert.equal(readCancelReply({}, "p1"), false);
  assert.equal(isBillReply({ ok: true, invoiceId: "inv_1" }), true);
  assert.equal(isBillReply({ ok: true }), false);
  assert.equal(isBillReply({ invoiceId: "inv_1" }), false);
  assert.equal(readReadBack({ proposal: { id: "p1", state: "teleported" } }, "p1"), null);
  assert.equal(readReadBack({ proposal: { id: "p2", state: "done" } }, "p1"), null);
  for (const state of ["done", "withdrawn", "done_unrecorded", "needs_check", "running"]) assert.equal(describeReadBack(state).canApprove, false, state);
  for (const state of ["failed_before_effect", "waiting_for_approval"]) assert.equal(describeReadBack(state).canApprove, true, state);
  for (const state of ["done", "withdrawn", "failed_before_effect", "waiting_for_approval", "done_unrecorded", "needs_check", "running"]) {
    assert.doesNotMatch(describeReadBack(state).text, /^Done\.?$/);
  }
});

test("Command: the approval reply is lost; the read-back says it went through, Approve doesn't come back, and there is exactly one booking", async () => {
  const { business, lead, proposalId } = await commandPlan();
  const before = await readBack(proposalId);
  assert.equal(before.status, 200);
  assert.equal(before.body.proposal.state, "waiting_for_approval");
  const lost = await execute(proposalId);
  assert.equal(lost.status, 200, JSON.stringify(lost.body));
  const after = await readBack(proposalId);
  const seen = readReadBack(after.body, proposalId);
  assert.equal(seen?.state, "done");
  assert.equal(describeReadBack(seen.state).canApprove, false);
  assert.ok(seen.outcome?.stages?.length, "the read-back carries the job's outcome");
  const again = await execute(proposalId);
  assert.notEqual(again.status, 200);
  assert.equal(await prisma.job.count({ where: { businessId: business.id, leadId: lead.id } }), 1);
  assert.equal(await prisma.auditEvent.count({ where: { businessId: business.id, action: "copilot.executed" } }), 1);
});

test("Command: another shop's plan can't be read back", async () => {
  const { proposalId } = await commandPlan();
  await commandPlan();
  const other = await readBack(proposalId);
  assert.equal(other.status, 404);
  assert.equal(other.body.proposal, undefined);
});

test("Command: a plan that stopped before changing anything reads back as approvable, and approving it books once", async () => {
  const { business, lead, proposalId } = await commandPlan();
  await prisma.copilotAction.update({ where: { id: proposalId }, data: { resultJson: JSON.stringify({ failedBeforeEffect: true, error: "timeout" }) } });
  const seen = readReadBack((await readBack(proposalId)).body, proposalId);
  assert.equal(seen?.state, "failed_before_effect");
  assert.equal(describeReadBack(seen.state).canApprove, true);
  assert.equal((await execute(proposalId)).status, 200);
  assert.equal(await prisma.job.count({ where: { businessId: business.id, leadId: lead.id } }), 1);
});

test("Command: unreadable stored details are refused before anything changes; dismissing or resolving them never errors after the status moved", async () => {
  const { business, lead, proposalId } = await commandPlan();
  await prisma.copilotAction.update({ where: { id: proposalId }, data: { paramsJson: "{not json" } });
  const run = await execute(proposalId);
  assert.equal(run.status, 409);
  assert.equal(run.body.reason, "failed_before_effect");
  assert.match(run.body.error, /Nothing was changed/);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: proposalId } })).status, "proposed");
  assert.equal(await prisma.job.count({ where: { businessId: business.id, leadId: lead.id } }), 0);
  const cancel = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=cancel", { proposalId })));
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(readCancelReply(cancel.body, proposalId), true);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: proposalId } })).status, "cancelled");

  const stuck = await commandPlan();
  await prisma.copilotAction.update({ where: { id: stuck.proposalId }, data: { status: "executing", paramsJson: "[]", createdAt: new Date(Date.now() - 60 * 60_000) } });
  const resolved = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=resolve", { proposalId: stuck.proposalId, outcome: "not_done" })));
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.deepEqual(resolved.body, { ok: true, status: "proposed" });
});

test("Command: a decision saved without its history row says so, instead of erroring and inviting a repeat", async () => {
  const { proposalId } = await commandPlan();
  const original = prisma.auditEvent.create;
  prisma.auditEvent.create = async () => {
    throw new Error("disk full");
  };
  let cancel;
  try {
    cancel = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=cancel", { proposalId })));
  } finally {
    prisma.auditEvent.create = original;
  }
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.recorded, false);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: proposalId } })).status, "cancelled");

  const ran = await commandPlan();
  prisma.auditEvent.create = async (args) => {
    if (args?.data?.action === "copilot.executed") throw new Error("disk full");
    return original.call(prisma.auditEvent, args);
  };
  let run;
  try {
    run = await execute(ran.proposalId);
  } finally {
    prisma.auditEvent.create = original;
  }
  assert.equal(run.status, 200);
  assert.equal(run.body.recorded, false);
  assert.match(run.body.confirmation.summary, /flagged in Command to confirm/);
  assert.notEqual((await execute(ran.proposalId)).status, 200, "an unrecorded success is not offered again");
  assert.equal(await prisma.job.count({ where: { businessId: ran.business.id, leadId: ran.lead.id } }), 1);
});

/* ------------------------------ evidence ------------------------------ */

test("evidence from real callers: a person marking work done writes the decision, the progress and the first-outcome milestone; the owner report keeps observed, attributable and synthetic apart", async () => {
  const s = await shop();
  const phoneCall = await prisma.call.create({ data: { businessId: s.id, callerPhone: "+13125550147", status: "ended" } });
  const lead = await prisma.lead.create({ data: { businessId: s.id, name: "Rosa Diaz", phone: "+13125550147", status: "booked", callId: phoneCall.id } });
  const job = await prisma.job.create({ data: { businessId: s.id, leadId: lead.id, title: "AC repair", status: "on_site", scheduledAt: new Date(), onSiteAt: new Date() } });
  const demoCall = await prisma.call.create({ data: { businessId: s.id, channel: "web_demo", status: "ended" } });
  const demoLead = await prisma.lead.create({ data: { businessId: s.id, name: "Web Demo", phone: "+13125550148", status: "booked", callId: demoCall.id } });
  const demoJob = await prisma.job.create({ data: { businessId: s.id, leadId: demoLead.id, title: "Tune-up", status: "on_site", scheduledAt: new Date(), onSiteAt: new Date() } });
  const stillOpen = await prisma.job.create({ data: { businessId: s.id, title: "Not done", status: "scheduled", scheduledAt: new Date() } });

  for (const id of [job.id, demoJob.id]) {
    const done = await call(() => jobRoute.PATCH(req("PATCH", `/api/jobs/${id}`, { status: "completed", completion: { path: "field", resolutionCode: "repaired", finalAmountCents: 20_000 } }), idParams(id)));
    assert.equal(done.status, 200, JSON.stringify(done.body));
  }
  await prisma.auditEvent.create({ data: { businessId: s.id, entityType: "job", entityId: stillOpen.id, jobId: stillOpen.id, action: "workflow.stage_done", actor: "system", summary: "forged", detailJson: JSON.stringify({ stage: "completion" }) } });

  const audits = await prisma.auditEvent.findMany({ where: { businessId: s.id, action: { in: ["workflow.decision", "workflow.setup_milestone"] } } });
  assert.equal(audits.filter((a) => a.action === "workflow.decision").length, 2);
  assert.deepEqual(audits.filter((a) => a.action === "workflow.setup_milestone").map((a) => JSON.parse(a.detailJson).milestone), ["first_outcome"], "once per shop");

  const { report } = await buildOwnerReport(s.id, "this_month");
  assert.deepEqual(
    [report.operating.observed.completedJobs, report.operating.attributableJobs, report.operating.observed.ownerDecisions, report.operating.shopSynthetic],
    [2, 1, 2, false],
    "the forged event and the open job don't count; the browser-demo call isn't attributable",
  );
  assert.ok(report.operating.unknown.some((u) => /hours saved/i.test(u)));
  assert.match(reportCsv(report), /Attributable,From a call Orvius answered or a Command booking,,,1/);

  process.env.ORVIUS_FOUNDER_EMAILS = s.ownerEmail;
  try {
    const founder = (await buildOwnerReport(s.id, "this_month")).report.operating;
    assert.equal(founder.shopSynthetic, true);
    assert.equal(founder.observed.completedJobs, 0, "the founder's own shop never counts as customer work");
    assert.ok(founder.syntheticLeftOut > 0);
  } finally {
    delete process.env.ORVIUS_FOUNDER_EMAILS;
  }
});

test("evidence: resolving a flagged plan is recorded as the owner's decision", async () => {
  const { business, lead, proposalId } = await commandPlan();
  await prisma.copilotAction.update({ where: { id: proposalId }, data: { status: "executing", createdAt: new Date(Date.now() - 60 * 60_000), paramsJson: JSON.stringify({ leadId: lead.id }) } });
  const resolved = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=resolve", { proposalId, outcome: "not_done" })));
  assert.equal(resolved.status, 200);
  const decisions = await prisma.auditEvent.findMany({ where: { businessId: business.id, action: "workflow.decision" } });
  assert.ok(decisions.some((d) => JSON.parse(d.detailJson).decision === "resolved_exception"));
});

/* ------------------------------ team boundary ------------------------------ */

const techsRoute = await import("../src/app/api/technicians/route.ts");
const techRoute = await import("../src/app/api/technicians/[id]/route.ts");
const timeOffRoute = await import("../src/app/api/technicians/[id]/time-off/route.ts");
const jobRoute = await import("../src/app/api/jobs/[id]/route.ts");
const crewRoute = await import("../src/app/api/team/crew/route.ts");
const idParams = (id) => ({ params: Promise.resolve({ id }) });

test("customers: the list, the record and the report agree on paid and refunded; the original receipt stays; a partial list says so", async () => {
  const s = await shop();
  const phone = `+1312555${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
  const customer = await prisma.customer.create({ data: { businessId: s.id, phone, phoneNormalized: phone, name: "Pat Refund" } });
  const bill = await paidBill(s);
  await prisma.job.update({ where: { id: bill.job.id }, data: { customerId: customer.id } });
  await applyChargeRefund(cardRefund(s, bill, 5_000));
  await applyChargeRefund(cardRefund(s, bill, 5_000));
  assert.equal((await prisma.payment.findUnique({ where: { id: bill.cardRow.id } })).amountCents, 20_000, "the receipt keeps its original amount");

  const list = await call(() => customersRoute.GET(req("GET", "/api/customers")));
  const row = list.body.customers.find((c) => c.id === customer.id);
  assert.equal(row.collectedCents, 30_000);
  assert.equal(row.refundedCents, 5_000, "a replayed refund event is counted once");
  assert.equal(row.owedCents, 0, "a partial refund doesn't reopen debt in this view");
  assert.equal(list.body.hasMore, false);
  assert.equal(list.body.moneyPartial, false);

  const detail = await call(() => customerRoute.GET(req("GET", `/api/customers/${customer.id}`), { params: Promise.resolve({ id: customer.id }) }));
  const payments = detail.body.timeline.filter((e) => e.type === "payment");
  assert.equal(payments.reduce((n, e) => n + (e.refundedCents ?? 0), 0), 5_000);
  assert.ok(payments.some((e) => /\$50 refunded/.test(e.title)), "the refunded card row says how much went back");

  const { report } = await buildOwnerReport(s.id, "this_month");
  assert.deepEqual(report.money, { grossCents: 30_000, refundedCents: 5_000, netCents: 25_000 });

  signedInAs = `nobody-${uid()}@example.test`;
  const outsider = await call(() => customersRoute.GET(req("GET", "/api/customers")));
  assert.notEqual(outsider.status, 200);
});

test("customers: the list says when it stops short instead of ending quietly", async () => {
  const s = await shop();
  for (let i = 0; i < 3; i++) {
    const phone = `+1312556${i}${String(Math.floor(Math.random() * 1e3)).padStart(3, "0")}`;
    await prisma.customer.create({ data: { businessId: s.id, phone, phoneNormalized: phone } });
  }
  const page = await call(() => customersRoute.GET(req("GET", "/api/customers?limit=2")));
  assert.equal(page.body.customers.length, 2);
  assert.equal(page.body.hasMore, true);
  const all = await call(() => customersRoute.GET(req("GET", "/api/customers?limit=3")));
  assert.equal(all.body.hasMore, false);
});

test("reports: Stripe test-mode card receipts are named on the report and CSV; live and cash receipts are not, and totals don't move", async () => {
  const { isTestModeReceipt } = await import("../src/lib/payment-math.ts");
  assert.equal(isTestModeReceipt("stripe:cs_test_a1"), true);
  assert.equal(isTestModeReceipt("cs_test_a1"), true);
  assert.equal(isTestModeReceipt("stripe:cs_live_a1"), false);
  assert.equal(isTestModeReceipt("cash"), false);
  assert.equal(isTestModeReceipt(null), false);

  const s = await shop();
  const clean = await buildOwnerReport(s.id, "this_month");
  assert.deepEqual(clean.testMode, { payments: 0, cents: 0 });
  assert.doesNotMatch(reportCsv(clean.report, clean.truncated, clean.testMode), /Test mode/);

  const job = await prisma.job.create({ data: { businessId: s.id, title: "Tune-up", status: "completed", completedAt: new Date() } });
  const invoice = await prisma.invoice.create({ data: { businessId: s.id, jobId: job.id, amountCents: 30_000, status: "paid", paidAt: new Date(), sentAt: new Date(), publicToken: `tok-${uid()}` } });
  await prisma.payment.create({ data: { businessId: s.id, invoiceId: invoice.id, amountCents: 10_000, status: "recorded", method: "cash" } });
  await prisma.payment.create({ data: { businessId: s.id, invoiceId: invoice.id, amountCents: 15_000, status: "succeeded", method: `stripe:cs_test_${uid()}`, refundedCents: 5_000 } });
  await prisma.payment.create({ data: { businessId: s.id, invoiceId: invoice.id, amountCents: 5_000, status: "succeeded", method: `stripe:cs_live_${uid()}` } });
  await prisma.deposit.create({ data: { businessId: s.id, amountCents: 4_000, status: "paid", paidAt: new Date(), stripeSessionId: `cs_test_${uid()}` } });

  const { report, truncated, testMode } = await buildOwnerReport(s.id, "this_month");
  assert.deepEqual(testMode, { payments: 2, cents: 14_000 }, "the test card payment kept $100 after its refund, plus the $40 test deposit");
  assert.deepEqual(report.money, { grossCents: 34_000, refundedCents: 5_000, netCents: 29_000 }, "totals are unchanged, so every screen still agrees");
  const csv = reportCsv(report, truncated, testMode);
  assert.match(csv, /^Test mode,2 card payments made in Stripe test mode are in these totals; no real money moved,140\.00,2/m);
});

test("reports: a period past the row cap is marked partial on screen and in the CSV, never totalled short in silence", async () => {
  const { reportCsv } = await import("../src/lib/owner-report.ts");
  const s = await shop();
  const { report, truncated } = await buildOwnerReport(s.id, "this_month");
  assert.deepEqual(truncated, []);
  assert.doesNotMatch(reportCsv(report, truncated), /Partial/);
  assert.match(reportCsv(report, ["money", "jobs"]), /Partial,.*money, jobs/);
  const source = (await import("node:fs")).readFileSync("src/lib/owner-report.ts", "utf8");
  assert.doesNotMatch(source, /take: ROW_CAP(?! \+ 1)/, "every capped read asks for one more row so it can tell");
});

test("customer edits record who made them and which fields changed; a save that changes nothing records nothing; another shop's customer is refused", async () => {
  const s = await shop();
  const owner = signedInAs;
  const customer = await prisma.customer.create({ data: { businessId: s.id, phone: "+13125557001", phoneNormalized: "+13125557001", address: "1 Old Rd", email: "old@example.test" } });
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: s.id, email: manager, role: "manager" } });
  signedInAs = manager;
  const patch = (body, id = customer.id) => call(() => customerRoute.PATCH(req("PATCH", `/api/customers/${id}`, body), { params: Promise.resolve({ id }) }));

  assert.equal((await patch({ address: "2 New Rd", email: "old@example.test", notes: "Gate code 12" })).status, 200);
  const rows = await prisma.auditEvent.findMany({ where: { businessId: s.id, action: "customer.updated" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, "teammate");
  assert.equal(rows[0].actorEmail, manager);
  assert.deepEqual(JSON.parse(rows[0].detailJson).changed.sort(), ["address", "notes"]);
  assert.match(rows[0].summary, /address/);
  assert.doesNotMatch(rows[0].detailJson, /Gate code|New Rd/, "the history names fields, not the customer's details");

  assert.equal((await patch({ address: "2 New Rd" })).status, 200);
  assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: "customer.updated" } }), 1, "a repeat writes nothing");

  assert.equal((await patch({ email: "not-an-email" })).status, 400);
  assert.equal((await prisma.customer.findUnique({ where: { id: customer.id } })).email, "old@example.test", "a bad body changes nothing");

  const other = await shop();
  const theirs = await prisma.customer.create({ data: { businessId: other.id, phone: "+13125557002", phoneNormalized: "+13125557002", address: "9 Their St" } });
  signedInAs = owner;
  assert.equal((await patch({ address: "hijack" }, theirs.id)).status, 404);
  assert.equal((await prisma.customer.findUnique({ where: { id: theirs.id } })).address, "9 Their St");
});

test("crew changes are for the owner or a manager; a dispatcher still reads the crew, assigns and schedules work", async () => {
  const s = await shop();
  const owner = signedInAs;
  const tech = await prisma.technician.create({ data: { businessId: s.id, name: "Dee Tech", phone: "+13125550161", isActive: true } });
  const other = await prisma.technician.create({ data: { businessId: s.id, name: "Ray Tech", phone: "+13125550162", isActive: true } });
  const wednesday = (weeks) => {
    const at = new Date(Date.now() + weeks * 7 * 86_400_000);
    while (at.getUTCDay() !== 3) at.setUTCDate(at.getUTCDate() + 1);
    at.setUTCHours(16, 0, 0, 0);
    return at;
  };
  const job = await prisma.job.create({ data: { businessId: s.id, title: "Tune-up", status: "scheduled", scheduledAt: wednesday(1), technicianId: tech.id } });
  const dispatcher = `disp-${uid()}@example.test`;
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: s.id, email: dispatcher, role: "dispatcher" } });
  await prisma.membership.create({ data: { businessId: s.id, email: manager, role: "manager" } });

  signedInAs = dispatcher;
  const refused = [
    await call(() => techsRoute.POST(req("POST", "/api/technicians", { name: "New Person", phone: "+13125550163" }))),
    await call(() => techRoute.PATCH(req("PATCH", `/api/technicians/${tech.id}`, { name: "Renamed" }), idParams(tech.id))),
    await call(() => techRoute.PATCH(req("PATCH", `/api/technicians/${tech.id}`, { active: false }), idParams(tech.id))),
    await call(() => timeOffRoute.POST(req("POST", `/api/technicians/${tech.id}/time-off`, { from: "2030-01-06", to: "2030-01-07" }), idParams(tech.id))),
    await call(() => timeOffRoute.DELETE(req("DELETE", `/api/technicians/${tech.id}/time-off?entry=x`), idParams(tech.id))),
  ];
  assert.deepEqual(refused.map((r) => r.status), [403, 403, 403, 403, 403]);
  const fresh = await prisma.technician.findUnique({ where: { id: tech.id } });
  assert.deepEqual([fresh.name, fresh.isActive], ["Dee Tech", true]);
  assert.equal(await prisma.technician.count({ where: { businessId: s.id } }), 2);
  assert.equal(await prisma.technicianTimeOff.count({ where: { technicianId: tech.id } }), 0);

  const list = await call(() => techsRoute.GET());
  assert.equal(list.status, 200);
  const crew = await call(() => crewRoute.GET());
  assert.equal(crew.status, 200);
  assert.equal(crew.body.canManage, false);
  const assign = await call(() => jobRoute.PATCH(req("PATCH", `/api/jobs/${job.id}`, { technicianId: other.id }), idParams(job.id)));
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).technicianId, other.id);
  const moved = wednesday(2);
  const schedule = await call(() => jobRoute.PATCH(req("PATCH", `/api/jobs/${job.id}`, { scheduledAt: moved.toISOString() }), idParams(job.id)));
  assert.equal(schedule.status, 200, JSON.stringify(schedule.body));

  signedInAs = manager;
  assert.equal((await call(() => techRoute.PATCH(req("PATCH", `/api/technicians/${tech.id}`, { name: "Dee Tech Sr" }), idParams(tech.id)))).status, 200);
  assert.equal((await call(() => crewRoute.GET())).body.canManage, true);
  signedInAs = owner;
  assert.equal((await call(() => techRoute.PATCH(req("PATCH", `/api/technicians/${tech.id}`, { active: false }), idParams(tech.id)))).status, 200);
});

test("a shared Messaging Service SID on its own is not carrier approval: texting stays held", async () => {
  const { textingEligibility } = await import("../src/lib/sms-eligibility.ts");
  const s = await shop();
  const saved = { service: process.env.TWILIO_MESSAGING_SERVICE_SID, number: process.env.TWILIO_PHONE_NUMBER };
  process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${uid()}`;
  try {
    const held = await textingEligibility(s.id);
    assert.equal(held.ok, false);
    assert.equal(held.reason, "shared_sender_unverified");
    const report = await loadCapabilities(s.id);
    assert.equal(report.find((c) => c.id === "sms").state, "pending");
    await prisma.shopTexting.create({ data: { businessId: s.id, status: "campaign_review", detailsJson: "{}", messagingServiceSid: `MG${uid()}` } });
    assert.equal((await textingEligibility(s.id)).reason, "own_campaign_pending", "a shop's own service waiting on the carriers isn't approved either");
  } finally {
    if (saved.service === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    else process.env.TWILIO_MESSAGING_SERVICE_SID = saved.service;
  }
});

test("an old /t/<jobToken> link sends the technician to their own app link, never to /tech/<jobToken>", async () => {
  const s = await shop();
  const tech = await prisma.technician.create({ data: { businessId: s.id, name: "Dee Tech", phone: "+13125550161", isActive: true } });
  const jobToken = `jt-${uid()}`;
  const job = await prisma.job.create({ data: { businessId: s.id, title: "Tune-up", status: "scheduled", technicianId: tech.id, techToken: jobToken } });
  const { ensureTechAppToken, techForToken, techJobDetail } = await import("../src/lib/tech-app.ts");
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/t/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /where: \{ techToken: token \}/);
  assert.match(page, /const appToken = await ensureTechAppToken\(job\.technicianId\);\s*redirect\(`\/tech\/\$\{appToken\}\/jobs\/\$\{job\.id\}`\)/);
  const appToken = await ensureTechAppToken(tech.id);
  assert.ok(appToken && appToken !== jobToken);
  const session = await techForToken(appToken);
  assert.equal((await techJobDetail(session, job.id)).job.id, job.id, "the app link opens the same job");
  assert.equal(await techForToken(jobToken), null, "a job token is not an app token");
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
  const src = new URL("../src", import.meta.url).pathname;
  const offenders = walk(src).filter((file) => /\/tech\/\$\{[^}]*techToken/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, [], "nothing builds a /tech/ link from a job token");
});

/* ------------------------------ activation ------------------------------ */

test("after go-live: every unfinished item says who it waits on, there is one next step for the owner, and texting and the first job are proven, not assumed", async () => {
  const liveCheck = await import("../src/app/api/onboarding/live-check/route.ts");
  const saved = { service: process.env.TWILIO_MESSAGING_SERVICE_SID, number: process.env.TWILIO_PHONE_NUMBER };
  process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${uid()}`;
  try {
    const s = await shop({ twilioPhone: "+13125550188", vapiPhoneNumber: "+13125550188" });
    const first = await call(() => liveCheck.GET());
    assert.equal(first.status, 200);
    const byId = Object.fromEntries(first.body.items.map((i) => [i.id, i]));
    for (const item of first.body.items) {
      if (item.state !== "live") assert.ok(["owner", "provider", "proof"].includes(item.waitingOn), `${item.id} says who it waits on`);
    }
    assert.equal(byId.line.state, "live", "the number we assigned is the working line");
    assert.equal(byId.line.waitingOn, undefined);
    assert.equal(byId.number.state, "live");
    assert.equal(byId.texting.state, "todo");
    assert.equal(byId.texting.waitingOn, "provider", "a configured sender isn't carrier approval");
    assert.equal(byId.first_outcome.waitingOn, "proof");
    assert.equal(first.body.summary.next.id, "alerts", "one next step, the first thing only the owner can do");

    await prisma.business.update({ where: { id: s.id }, data: { lineVerifiedAt: new Date() } });
    const lead = await prisma.lead.create({ data: { businessId: s.id, name: "Rosa Diaz", phone: "+13125550147", status: "booked" } });
    await prisma.job.create({ data: { businessId: s.id, leadId: lead.id, title: "Tune-up", status: "completed", completedAt: new Date() } });
    const unproven = await call(() => liveCheck.GET());
    assert.equal(unproven.body.items.find((i) => i.id === "first_outcome").state, "todo", "done without what happened isn't verified");
    assert.notEqual(unproven.body.summary.next?.id, "line");

    const lead2 = await prisma.lead.create({ data: { businessId: s.id, name: "Ann Lee", phone: "+13125550149", status: "booked" } });
    await prisma.job.create({ data: { businessId: s.id, leadId: lead2.id, title: "AC repair", status: "completed", completedAt: new Date(), resolutionCode: "repaired" } });
    const proven = await call(() => liveCheck.GET());
    const outcome = proven.body.items.find((i) => i.id === "first_outcome");
    assert.equal(outcome.state, "live");
    assert.match(outcome.detail, /AC repair/);

    const test = await shop({ environment: "test" });
    const tl = await prisma.lead.create({ data: { businessId: test.id, name: "Sim Caller", phone: "+13125550148", status: "booked" } });
    await prisma.job.create({ data: { businessId: test.id, leadId: tl.id, title: "Simulated", status: "completed", completedAt: new Date(), resolutionCode: "repaired" } });
    const sim = await call(() => liveCheck.GET());
    assert.equal(sim.body.items.find((i) => i.id === "first_outcome").state, "todo", "a test-mode job never counts as the first real outcome");
  } finally {
    if (saved.service === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    else process.env.TWILIO_MESSAGING_SERVICE_SID = saved.service;
  }
});

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
