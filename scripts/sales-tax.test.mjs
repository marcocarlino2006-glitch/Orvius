#!/usr/bin/env node
/*
 * Sales tax on what customers owe the shop. Driven against the real database:
 * the tax lands once, on the invoice, the deposit still comes off, a sent bill
 * keeps its rate, the customer sees the lines, and Orvius's fee skips the tax.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;
delete process.env.ORVIUS_PLATFORM_FEE_BPS;

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const sessions = [];
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, {
  namedExports: {
    ...realStripe,
    getStripe: () => ({
      checkout: {
        sessions: {
          create: async (params) => {
            sessions.push(params);
            return { id: `cs_test_${sessions.length}`, url: "https://checkout.stripe.test/s" };
          },
        },
      },
    }),
  },
});
process.env.STRIPE_SECRET_KEY ||= "sk_test_tax";

const { feeBaseCents, formatTaxRate, parseTaxRate, taxCentsFor, withSalesTax } = await import("../src/lib/sales-tax.ts");
const { balanceDueForJob, createInvoiceCheckoutSession, fulfillInvoiceCheckoutSession, upsertJobInvoice } = await import(
  "../src/lib/invoice-pay.ts"
);
const { ensureInvoiceForEstimate } = await import("../src/lib/estimate-pay.ts");
const { calculatePlatformFeeCents } = await import("../src/lib/platform-fee.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const made = [];
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const CONNECTED = {
  stripeConnectAccountId: "acct_tax_test",
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
};

async function makeJob(shop = {}) {
  const business = await prisma.business.create({
    data: {
      name: "Tax Heating",
      slug: `tax-${uid()}`,
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail: `owner-${uid()}@example.test`,
      ...shop,
    },
  });
  made.push(business.id);
  const lead = await prisma.lead.create({ data: { businessId: business.id, name: "Dana", phone: "+15555550299", serviceType: "No heat" } });
  const job = await prisma.job.create({ data: { businessId: business.id, leadId: lead.id, title: "Furnace repair" } });
  return { business, lead, job };
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("the math is exact to the cent and rates read the way owners type them", () => {
  assert.equal(taxCentsFor(64_000, 825), 5_280);
  assert.equal(taxCentsFor(9_999, 825), 825);
  assert.equal(taxCentsFor(1_000, 0), 0);
  assert.deepEqual(withSalesTax(50_000, 700), { subtotalCents: 50_000, taxBps: 700, taxCents: 3_500, totalCents: 53_500 });
  assert.equal(withSalesTax(50_000, 99_999).taxBps, 1500, "a runaway rate is capped, never billed");
  assert.equal(formatTaxRate(825), "8.25%");
  assert.equal(formatTaxRate(700), "7%");
  assert.equal(formatTaxRate(1), "0.01%");
  assert.equal(parseTaxRate("8.25"), 825);
  assert.equal(parseTaxRate(" 8.25% "), 825);
  assert.equal(parseTaxRate(""), 0);
  assert.equal(parseTaxRate("abc"), null);
  assert.equal(parseTaxRate("16"), null);
  assert.equal(parseTaxRate("-1"), null);
  assert.equal(feeBaseCents({ amountCents: 53_500, taxCents: 3_500 }), 50_000);
  assert.equal(feeBaseCents({ amountCents: 1_000 }), 1_000);
});

test("no rate set: the bill is exactly what it was before", async () => {
  const { business, job } = await makeJob();
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 64_000 });
  assert.equal(invoice.amountCents, 64_000);
  assert.equal(invoice.taxCents, 0);
  assert.equal(invoice.subtotalCents, 64_000);
});

test("tax goes on the work once, and the deposit still comes off after", async () => {
  const { business, lead, job } = await makeJob({ salesTaxBps: 825 });
  await prisma.deposit.create({ data: { businessId: business.id, leadId: lead.id, amountCents: 9_900, status: "paid" } });
  const due = await balanceDueForJob({ businessId: business.id, jobId: job.id, totalCents: 64_000 });
  assert.deepEqual(due, { totalCents: 64_000, taxBps: 825, taxCents: 5_280, depositPaidCents: 9_900, balanceCents: 59_380 });

  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 64_000 });
  assert.equal(invoice.amountCents, 59_380);
  assert.equal(invoice.subtotalCents, 64_000);
  assert.equal(invoice.taxCents, 5_280);
  assert.equal(invoice.taxBps, 825);

  const repriced = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 70_000 });
  assert.equal(repriced.invoice.id, invoice.id);
  assert.equal(repriced.invoice.taxCents, 5_775);
  assert.equal(repriced.invoice.amountCents, 70_000 + 5_775 - 9_900);
});

test("Orvius's fee is on the work, not the tax, at checkout and at fulfilment", async () => {
  const { business, job } = await makeJob({ salesTaxBps: 1000, ...CONNECTED });
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 100_000 });
  assert.equal(invoice.amountCents, 110_000);

  sessions.length = 0;
  await createInvoiceCheckoutSession({ invoice, business, jobTitle: job.title });
  const created = sessions[0];
  assert.equal(created.line_items[0].price_data.unit_amount, 110_000, "the customer pays work plus tax");
  assert.equal(created.payment_intent_data.application_fee_amount, calculatePlatformFeeCents(100_000));

  const result = await fulfillInvoiceCheckoutSession({
    id: `cs_test_fallback_${invoice.id}`,
    status: "complete",
    payment_status: "paid",
    amount_total: 110_000,
    metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: business.id, publicToken: invoice.publicToken },
  });
  assert.deepEqual(result, { ok: true });
  const paid = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  assert.equal(paid.applicationFeeCents, calculatePlatformFeeCents(100_000));
});

test("an estimate's invoice adds tax, and a later rate change never reprices it", async () => {
  const { business, job } = await makeJob({ salesTaxBps: 600 });
  const estimate = await prisma.estimate.create({
    data: { businessId: business.id, jobId: job.id, amountCents: 20_000, status: "sent", publicToken: `est-${uid()}` },
  });
  const first = await ensureInvoiceForEstimate({ ...estimate, invoice: null });
  assert.equal(first.amountCents, 21_200);
  assert.equal(first.taxCents, 1_200);

  await prisma.business.update({ where: { id: business.id }, data: { salesTaxBps: 900 } });
  const again = await ensureInvoiceForEstimate({ ...estimate, invoice: { id: first.id } });
  assert.deepEqual(again, first);
});

test("the customer's pay page shows work, tax, deposit and what's due", async () => {
  const { GET } = await import("../src/app/api/public/invoice/[token]/route.ts");
  const { business, lead, job } = await makeJob({ salesTaxBps: 825 });
  await prisma.deposit.create({ data: { businessId: business.id, leadId: lead.id, amountCents: 5_000, status: "paid" } });
  const { invoice } = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 40_000 });
  const res = await GET(new Request(`http://localhost/api/public/invoice/${invoice.publicToken}`), {
    params: Promise.resolve({ token: invoice.publicToken }),
  });
  const body = await res.json();
  const page = body.invoice ?? body;
  assert.deepEqual(page.lines, [
    { label: "Work", value: "$400.00" },
    { label: "Sales tax (8.25%)", value: "$33.00" },
    { label: "Deposit paid", value: "−$50.00" },
  ]);
  assert.equal(page.amountLabel, "$383.00");
});

test("the estimate page tells the customer about tax before they accept", async () => {
  const { GET } = await import("../src/app/api/public/estimate/[token]/route.ts");
  const { business, job } = await makeJob({ salesTaxBps: 825 });
  const token = `est-${uid()}`;
  await prisma.estimate.create({ data: { businessId: business.id, jobId: job.id, amountCents: 40_000, status: "sent", publicToken: token } });
  const res = await GET(new Request(`http://localhost/api/public/estimate/${token}`), { params: Promise.resolve({ token }) });
  const body = await res.json();
  assert.equal((body.estimate ?? body).taxNote, "Plus 8.25% sales tax ($33.00). Total $433.00.");
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("settings save the rate and refuse one over 15%", async () => {
  const { PATCH } = await import("../src/app/api/account/route.ts");
  const { business } = await makeJob();
  signedInAs = business.ownerEmail;
  try {
    assert.equal((await PATCH(patch({ salesTaxBps: 825 }))).status, 200);
    assert.equal((await prisma.business.findUnique({ where: { id: business.id } })).salesTaxBps, 825);
    const bad = await PATCH(patch({ salesTaxBps: 2500 }));
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /15%/);
    assert.equal((await prisma.business.findUnique({ where: { id: business.id } })).salesTaxBps, 825);
  } finally {
    signedInAs = null;
  }
});
