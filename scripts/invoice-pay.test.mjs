/*
 * The final bill is where most of a shop's money moves, so these drive the
 * real functions against the real database. The expensive failures: billing a
 * deposit twice, issuing a second link for one job, and recording one card
 * payment twice when the webhook and the redirect race.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  balanceDueForJob,
  fulfillInvoiceCheckoutSession,
  invoiceCompletedJob,
  upsertJobInvoice,
} from "../src/lib/invoice-pay.ts";

const prisma = new PrismaClient();

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function makeJob(shopOverrides = {}, jobOverrides = {}) {
  const shop = await prisma.business.create({
    data: { name: "Invoice Proof HVAC", slug: unique("invoice-proof"), billingStatus: "pilot", ...shopOverrides },
  });
  const lead = await prisma.lead.create({
    data: { businessId: shop.id, name: "Dana Caller", phone: "+15555550223", serviceType: "No heat" },
  });
  const job = await prisma.job.create({
    data: { businessId: shop.id, leadId: lead.id, title: "Furnace repair", ...jobOverrides },
  });
  return { shop, lead, job };
}

function paidSession(invoice, businessId, overrides = {}) {
  return {
    id: `cs_test_${invoice.id}`,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: invoice.amountCents,
    metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId, publicToken: invoice.publicToken },
    ...overrides,
  };
}

test("a paid booking deposit comes off the bill, matched by lead or job", async () => {
  const { shop, lead, job } = await makeJob();
  await prisma.deposit.create({
    data: { businessId: shop.id, leadId: lead.id, amountCents: 9_900, status: "paid" },
  });
  await prisma.deposit.create({
    data: { businessId: shop.id, jobId: job.id, amountCents: 5_000, status: "pending" },
  });
  const due = await balanceDueForJob({ businessId: shop.id, jobId: job.id, totalCents: 64_000 });
  assert.deepEqual(due, { totalCents: 64_000, depositPaidCents: 9_900, balanceCents: 54_100 });
});

test("one job keeps one pay link, re-priced in place", async () => {
  const { shop, job } = await makeJob();
  const first = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 50_000 });
  const second = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 62_500 });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.invoice.id, first.invoice.id);
  assert.equal(second.invoice.publicToken, first.invoice.publicToken);
  assert.equal(second.invoice.amountCents, 62_500);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
});

test("fulfilment marks paid, stamps the 1% fee, and a replay records nothing", async () => {
  const { shop, job } = await makeJob();
  const { invoice } = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 64_000 });

  assert.deepEqual(await fulfillInvoiceCheckoutSession(paidSession(invoice, shop.id)), { ok: true });
  const replay = await fulfillInvoiceCheckoutSession(paidSession(invoice, shop.id));
  assert.equal(replay.reason, "already_paid");

  const stored = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { payments: true } });
  assert.equal(stored.status, "paid");
  assert.ok(stored.paidAt);
  assert.equal(stored.applicationFeeCents, 640);
  assert.equal(stored.payments.length, 1);
});

test("a paid invoice is never re-priced", async () => {
  const { shop, job } = await makeJob();
  const { invoice } = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 40_000 });
  await fulfillInvoiceCheckoutSession(paidSession(invoice, shop.id));
  const after = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 99_000 });
  assert.equal(after.invoice.status, "paid");
  assert.equal(after.invoice.amountCents, 40_000);
});

test("completion with a final amount opens the invoice; without Autopilot nothing is texted", async () => {
  const { job } = await makeJob({ autopilot: false }, { finalAmountCents: 38_000, status: "completed" });
  const result = await invoiceCompletedJob(job.id);
  assert.equal(result.invoiced, true);
  assert.equal(result.sms, null);
  assert.equal(result.invoice.amountCents, 38_000);
  assert.equal(result.invoice.status, "open");
  assert.ok(result.invoice.publicToken);
});

test("completion without a final amount creates no invoice", async () => {
  const { job } = await makeJob();
  assert.deepEqual(await invoiceCompletedJob(job.id), { invoiced: false });
});

test.after(async () => {
  await prisma.$disconnect();
});
