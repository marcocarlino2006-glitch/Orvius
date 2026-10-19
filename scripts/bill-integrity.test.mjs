#!/usr/bin/env node
/*
 * A bill the customer already has keeps its amount. Disposable database, no
 * providers: a $185 bill that was sent, signed or paid toward is not silently
 * re-priced to $275 by a later step; the owner can change it only with a
 * reason on the record; an unsent draft still re-prices freely; and a double
 * tap on a booking's deposit leaves one active deposit link.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { NextRequest } = nextServer;
const { upsertJobInvoice } = await import("../src/lib/invoice-pay.ts");
const { createDepositForLead } = await import("../src/lib/booking-deposit.ts");
const invoiceRoute = await import("../src/app/api/jobs/[id]/invoice/route.ts");
const publicInvoiceRoute = await import("../src/app/api/public/invoice/[token]/route.ts");
const recordRoute = await import("../src/app/api/record-contract/route.ts");
const { buildCommandBoard } = await import("../src/lib/command-board.ts");
const { problemsFrom } = await import("../src/lib/work.ts");
const { fulfillInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

async function shop() {
  const row = await prisma.business.create({
    data: {
      name: "Bill Integrity HVAC",
      slug: `bill-${uid()}`,
      environment: "test",
      trade: "HVAC",
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail: `owner-${uid()}@example.test`,
    },
  });
  made.push(row.id);
  return row;
}

async function billed(business, data = {}) {
  const job = await prisma.job.create({ data: { businessId: business.id, title: "Furnace repair", status: "completed" } });
  const invoice = await prisma.invoice.create({
    data: { businessId: business.id, jobId: job.id, amountCents: 18_500, subtotalCents: 18_500, status: "open", publicToken: `tok-${uid()}`, ...data },
  });
  return { job, invoice };
}

const postInvoice = (jobId, body) =>
  invoiceRoute.POST(
    new NextRequest(`http://localhost/api/jobs/${jobId}/invoice`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: jobId }) },
  );

test("an unsent draft bill still re-prices freely", async () => {
  const business = await shop();
  const { job, invoice } = await billed(business, { status: "draft" });
  const result = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 27_500 });
  assert.equal(result.repriceHeld, undefined);
  assert.equal(result.invoice.amountCents, 27_500);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).amountCents, 27_500);
});

for (const [label, data] of [
  ["sent", () => ({ sentAt: new Date() })],
  ["paid toward", () => ({ status: "partial" })],
]) {
  test(`a ${label} $185 bill is not silently re-priced to $275: it stays, and the owner gets an exception`, async () => {
    const business = await shop();
    const { job, invoice } = await billed(business, data());
    const result = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 27_500 });
    assert.deepEqual(result.repriceHeld, { fromCents: 18_500, toCents: 27_500 });
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).amountCents, 18_500);
    const exception = await prisma.reconciliationException.findFirst({ where: { businessId: business.id, entityId: invoice.id, kind: "change" } });
    assert.ok(exception, "the difference is an open exception");
    assert.equal(exception.status, "open");
    assert.equal(JSON.parse(exception.observedJson).amountCents, 27_500);
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "invoice.reprice_held" } }));
    await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 27_500 });
    assert.equal(await prisma.reconciliationException.count({ where: { businessId: business.id, entityId: invoice.id } }), 1, "a retry doesn't stack exceptions");
  });
}

test("a bill from a signed estimate keeps the signed amount", async () => {
  const business = await shop();
  const job = await prisma.job.create({ data: { businessId: business.id, title: "New furnace", status: "completed" } });
  const estimate = await prisma.estimate.create({ data: { businessId: business.id, jobId: job.id, amountCents: 18_500, status: "accepted", publicToken: `est-${uid()}` } });
  await prisma.invoice.create({ data: { businessId: business.id, jobId: job.id, estimateId: estimate.id, amountCents: 18_500, status: "open", publicToken: `tok-${uid()}` } });
  const result = await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 27_500 });
  assert.equal(result.invoice.amountCents, 18_500);
  const exception = await prisma.reconciliationException.findFirst({ where: { businessId: business.id, kind: "change" } });
  assert.equal(JSON.parse(exception.expectedJson).basis, "signed_estimate");
});

test("the owner's billing route refuses the silent change and accepts it with a reason, on the record", async () => {
  const business = await shop();
  const { job, invoice } = await billed(business, { sentAt: new Date() });
  signedInAs = business.ownerEmail;
  try {
    const refused = await postInvoice(job.id, { totalCents: 27_500 });
    assert.equal(refused.status, 409);
    const body = await refused.json();
    assert.equal(body.code, "bill_committed");
    assert.match(body.error, /already has this bill at \$185\.00\. To change it to \$275\.00, add why/);
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).amountCents, 18_500);
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).finalAmountCents, null, "the job total isn't changed behind the bill either");

    const revised = await postInvoice(job.id, { totalCents: 27_500, reason: "Customer added a second zone on site" });
    assert.equal(revised.status, 200);
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).amountCents, 27_500);
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "invoice.revised" } });
    assert.ok(audit);
    assert.equal(audit.actorEmail, business.ownerEmail);
    assert.match(audit.summary, /\$185\.00 to \$275\.00.*second zone/);
  } finally {
    signedInAs = null;
  }
});

test("a double tap on a booking's deposit leaves one active deposit link", async () => {
  const business = await shop();
  const lead = await prisma.lead.create({ data: { businessId: business.id, phone: "+15550007777" } });
  const results = await Promise.all([1, 2, 3].map(() => createDepositForLead({ businessId: business.id, leadId: lead.id, amountCents: 5_000 })));
  assert.equal(await prisma.deposit.count({ where: { businessId: business.id, leadId: lead.id } }), 1);
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.deposit.publicToken)).size, 1, "every tap hands out the same link");

  const job = await prisma.job.create({ data: { businessId: business.id, title: "Walk-in" } });
  await Promise.all([1, 2].map(() => createDepositForLead({ businessId: business.id, leadId: null, jobId: job.id, amountCents: 5_000 })));
  assert.equal(await prisma.deposit.count({ where: { businessId: business.id, jobId: job.id } }), 1, "a job with no lead is one obligation too");
});

test("after a card refund the customer's bill keeps the receipt trail and says what was refunded", async () => {
  const business = await shop();
  const { invoice } = await billed(business, { amountCents: 50_000, subtotalCents: 50_000, status: "partial" });
  await prisma.payment.create({ data: { businessId: business.id, invoiceId: invoice.id, amountCents: 20_000, status: "recorded", method: "cash" } });
  await prisma.payment.create({ data: { businessId: business.id, invoiceId: invoice.id, amountCents: 30_000, status: "refunded", method: "stripe:cs_test_refunded" } });
  const res = await publicInvoiceRoute.GET(new Request(`http://localhost/api/public/invoice/${invoice.publicToken}`, { headers: { "x-forwarded-for": "203.0.113.9" } }), {
    params: Promise.resolve({ token: invoice.publicToken }),
  });
  const { invoice: view } = await res.json();
  assert.equal(view.paid, false);
  assert.equal(view.amountLabel, "$300.00");
  assert.deepEqual(
    view.lines.map((l) => `${l.label}: ${l.value}`),
    ["Invoice total: $500.00", "Paid so far: −$200.00", "Refunded to you: $300.00"],
  );
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 2, "the refunded payment stays on the record");
});

test("held money exceptions are on Command, linked to the job, and leave once someone says what they did", async () => {
  const business = await shop();
  const { job, invoice } = await billed(business, { sentAt: new Date() });
  await upsertJobInvoice({ businessId: business.id, jobId: job.id, totalCents: 27_500 });
  const paid = { mode: "payment", status: "complete", payment_status: "paid", amount_total: 18_500, metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: business.id } };
  await fulfillInvoiceCheckoutSession({ ...paid, id: `cs_${uid()}`, payment_intent: `pi_${uid()}` });
  await fulfillInvoiceCheckoutSession({ ...paid, id: `cs_${uid()}`, payment_intent: `pi_${uid()}` });

  const board = await buildCommandBoard(business.id);
  const items = board.lanes.exceptions.filter((e) => e.exception === "record_mismatch");
  assert.equal(items.length, 2);
  for (const item of items) assert.equal(item.jobId, job.id);
  const reprice = items.find((i) => /Bill total changed/.test(i.title));
  assert.match(reprice.detail, /sent bill stays at \$185\.00\. A new total of \$275\.00/);
  const late = items.find((i) => /Extra payment/.test(i.title));
  assert.match(late.detail, /paid \$185\.00 after the invoice was already settled\. Nothing was refunded/);

  const issues = problemsFrom(board.lanes, []).shop.filter((i) => i.resolveId);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].href, `/dashboard/jobs/${job.id}`);

  signedInAs = business.ownerEmail;
  try {
    const resolve = (body) => recordRoute.POST(new Request("http://x/api/record-contract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    assert.equal((await resolve({ id: late.reconcileId, resolution: "  " })).status, 422, "it takes what was done, not a bare click");
    assert.equal((await resolve({ id: late.reconcileId, resolution: "Refunded the extra in Stripe" })).status, 200);
  } finally {
    signedInAs = null;
  }
  const after = await buildCommandBoard(business.id);
  assert.deepEqual(after.lanes.exceptions.filter((e) => e.exception === "record_mismatch").map((e) => e.reconcileId), [reprice.reconcileId]);
  const row = await prisma.reconciliationException.findUnique({ where: { id: late.reconcileId } });
  assert.equal(row.resolvedBy, business.ownerEmail);
  assert.equal(row.resolution, "Refunded the extra in Stripe");
});
