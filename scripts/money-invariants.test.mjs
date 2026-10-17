#!/usr/bin/env node
/*
 * The live money records (Invoice, Payment, Deposit) are the only financial
 * source of truth. src/lib/receivable-ledger.ts and
 * prisma/prepared/receivables-v1.sql are a prepared design, not authoritative
 * and not imported by any live path. This suite proves, through the real
 * callers, that the live paths hold the invariants that design was written
 * for:
 *   1. one bill per job, even under concurrent issuance
 *   2. a bill the customer has is not re-priced without a stated reason
 *   3. a paid bill is never rewritten
 *   4. a deposit stays a deposit; it is subtracted from the job's bill, not edited
 *   5. one active deposit per booking, even under concurrent requests
 *   6. money that arrives after a bill is settled is held for a person, never counted or refunded silently
 *   7. a refund touches only the payment it was for; cash on the same bill stays collected
 *   8. manual (cash/check) and unlinked records follow the same balance rules
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];

const { upsertJobInvoice, fulfillInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");
const { createDepositForLead, fulfillDepositCheckoutSession } = await import("../src/lib/booking-deposit.ts");
const { applyChargeRefund } = await import("../src/lib/payment-refund.ts");
const { recordShopPayment, recordCustomerClaim } = await import("../src/lib/payment-record.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test.after(async () => {
  await prisma.$disconnect();
});

async function shopWithJob() {
  const business = await prisma.business.create({
    data: { name: "Ledger HVAC", slug: `ledger-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", hoursJson: "{}", servicesJson: "[]" },
  });
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550009001", name: "Pat", status: "booked" } });
  const job = await prisma.job.create({ data: { businessId: business.id, leadId: lead.id, title: "Furnace repair", status: "completed" } });
  return { business, lead, job };
}

const paidSession = (invoice, businessId, amount, id = `cs_${uid()}`) => ({
  id,
  payment_status: "paid",
  amount_total: amount,
  payment_intent: `pi_${id}`,
  metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId, applicationFeeCents: "0" },
});

test("the prepared receivables module is not a second source of truth: no live code imports it", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && path !== join("src", "lib", "receivable-ledger.ts") && /receivable-ledger|receivables-v1/.test(readFileSync(path, "utf8"))) offenders.push(path);
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(schema, /model JobReceivable/);
  assert.doesNotMatch(readFileSync("prisma/turso-migrate.sql", "utf8"), /JobReceivable/);
  assert.match(readFileSync("src/lib/receivable-ledger.ts", "utf8"), /not authoritative/i);
});

test("1. concurrent issuance makes one bill per job", async () => {
  const { business, job } = await shopWithJob();
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 20_000 + i })));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  assert.equal(new Set(results.map((r) => r.invoice.id)).size, 1);
});

test("2–3. a sent bill is held at its amount without a reason, revised with one; a paid bill is never rewritten", async () => {
  const { business, job } = await shopWithJob();
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 20_000 });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { sentAt: new Date() } });

  const held = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 26_000 });
  assert.deepEqual(held.repriceHeld, { fromCents: 20_000, toCents: 26_000 });
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).amountCents, 20_000);
  assert.ok(await prisma.reconciliationException.findFirst({ where: { businessId: business.id, entityId: invoice.id, kind: "change", status: "open" } }));

  const revised = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 26_000, revision: { reason: "Extra part", actor: "owner", actorEmail: "o@example.test" } });
  assert.equal(revised.invoice.amountCents, 26_000);
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "invoice.revised" } }));

  assert.equal((await fulfillInvoiceCheckoutSession(paidSession(invoice, business.id, 26_000))).ok, true);
  const after = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 30_000, revision: { reason: "Try again", actor: "owner", actorEmail: "o@example.test" } });
  assert.equal(after.invoice.amountCents, 26_000);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");
});

test("4–5. concurrent deposit requests make one deposit; once paid it is subtracted from the bill, not edited", async () => {
  const { business, lead, job } = await shopWithJob();
  const made = await Promise.all(Array.from({ length: 4 }, () => createDepositForLead({ businessId: business.id, leadId: lead.id, jobId: job.id, amountCents: 5_000 })));
  assert.equal(made.filter((d) => d.created).length, 1);
  assert.equal(await prisma.deposit.count({ where: { leadId: lead.id } }), 1);
  const deposit = made[0].deposit;
  const session = { id: `cs_dep_${uid()}`, payment_status: "paid", amount_total: 5_000, payment_intent: `pi_dep_${uid()}`, metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: business.id } };
  assert.equal((await fulfillDepositCheckoutSession(session)).ok, true);

  const { invoice, depositPaidCents } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 20_000 });
  assert.equal(depositPaidCents, 5_000);
  assert.equal(invoice.amountCents, 15_000, "the bill is the balance after the deposit");
  const after = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  assert.deepEqual([after.amountCents, after.status], [5_000, "paid"], "the deposit row itself is unchanged");

  const second = { ...session, id: `cs_dep2_${uid()}`, payment_intent: `pi_dep2_${uid()}` };
  assert.equal((await fulfillDepositCheckoutSession(second)).reason, "late_payment_held", "a second deposit charge is held, not counted");
});

test("6. a payment that arrives after the bill is settled is held for a person, never counted", async () => {
  const { business, job } = await shopWithJob();
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 18_000 });
  const first = paidSession(invoice, business.id, 18_000);
  const late = paidSession(invoice, business.id, 18_000);
  assert.equal((await fulfillInvoiceCheckoutSession(first)).ok, true);
  assert.equal((await fulfillInvoiceCheckoutSession(first)).reason, "already_paid", "a replay is not a second payment");
  assert.equal((await fulfillInvoiceCheckoutSession(late)).reason, "late_payment_held");
  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
  assert.equal(payments.length, 1);
  const exception = await prisma.reconciliationException.findFirst({ where: { businessId: business.id, entityId: invoice.id, kind: "payment" } });
  assert.match(exception.observedJson, /late_session_payment/);
});

test("7. refunds touch only their payment: partial leaves status, full reopens the card share, cash stays collected", async () => {
  const { business, job } = await shopWithJob();
  const account = `acct_${uid()}`;
  await prisma.business.update({ where: { id: business.id }, data: { stripeConnectAccountId: account } });
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 30_000 });
  assert.equal((await recordShopPayment({ businessId: business.id, invoiceId: invoice.id, jobId: job.id, method: "cash", amountCents: 10_000, actor: "owner" })).paid, false);
  const card = paidSession(invoice, business.id, 20_000);
  await fulfillInvoiceCheckoutSession(card);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");

  const meta = { kind: "invoice_pay", invoiceId: invoice.id, businessId: business.id };
  const partial = await applyChargeRefund({ metadata: meta, amountRefundedCents: 5_000, fullyRefunded: false, chargeId: `ch_${uid()}`, sessionId: card.id, account });
  assert.deepEqual(partial, { applied: "invoice", id: invoice.id, full: false });
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid", "a partial refund is recorded, not a status change");

  const full = await applyChargeRefund({ metadata: meta, amountRefundedCents: 20_000, fullyRefunded: true, chargeId: `ch_${uid()}`, sessionId: card.id, account });
  assert.equal(full.full, true);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "partial", "the cash is still collected");
  const rows = await prisma.payment.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(rows.map((p) => [p.method, p.status]), [["cash", "recorded"], [`stripe:${card.id}`, "refunded"]]);

  const stray = await applyChargeRefund({ metadata: meta, amountRefundedCents: 20_000, fullyRefunded: true, chargeId: `ch_${uid()}`, sessionId: "cs_never_recorded", account });
  assert.deepEqual(stray, { applied: null, reason: "duplicate_charge" }, "refunding an unrecorded charge changes nothing");
});

test("8. manual and unlinked records: a claim waits, cash supersedes it, and nothing over-collects", async () => {
  const { business, job } = await shopWithJob();
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 12_000 });
  await recordCustomerClaim({ businessId: business.id, invoiceId: invoice.id, amountCents: 12_000, jobId: job.id });
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "open", "a customer's word alone doesn't settle it");
  const cash = await recordShopPayment({ businessId: business.id, invoiceId: invoice.id, jobId: job.id, method: "check", amountCents: 99_000, actor: "owner" });
  assert.deepEqual([cash.paid, cash.amountCents], [true, 12_000], "capped at the balance");
  const statuses = (await prisma.payment.findMany({ where: { invoiceId: invoice.id } })).map((p) => p.status).sort();
  assert.deepEqual(statuses, ["recorded", "superseded"]);
  const again = await recordShopPayment({ businessId: business.id, invoiceId: invoice.id, jobId: job.id, method: "cash", actor: "owner" });
  assert.equal(again.ok, false);

  // An unlinked bill (no job) obeys the same balance rules.
  const loose = await prisma.invoice.create({ data: { businessId: business.id, amountCents: 7_500, status: "open", publicToken: `tok-${uid()}` } });
  const looseCash = await recordShopPayment({ businessId: business.id, invoiceId: loose.id, jobId: loose.id, method: "cash", amountCents: 7_500, actor: "owner" });
  assert.equal(looseCash.paid, true);
  assert.equal((await fulfillInvoiceCheckoutSession(paidSession(loose, business.id, 7_500))).reason, "late_payment_held");
});
