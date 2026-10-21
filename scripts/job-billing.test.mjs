#!/usr/bin/env node
/*
 * A completed job's invoice is its own record. A failed write, a second tap,
 * two workers, a crash after the insert, a no-charge job, and a bill the
 * customer already has must not lose the charge or open a second one.
 * Disposable shops. No providers.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
  delete process.env[key];
}
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

const { transitionJob } = await import("../src/lib/job-transition.ts");
const { invoiceCompletedJob } = await import("../src/lib/invoice-pay.ts");
const { listBillingExceptions, retryJobBilling, settleJobBilling, sweepUnbilledJobs } = await import("../src/lib/job-billing.ts");
const { buildCommandBoard } = await import("../src/lib/command-board.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const billingRoute = await import("../src/app/api/jobs/[id]/billing/route.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const owner = { kind: "owner", email: "owner@example.test" };

async function makeShop() {
  const shop = await prisma.business.create({
    data: {
      name: "Billing HVAC",
      slug: `bill-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      ownerEmail: `owner-${uid()}@example.test`,
      ownerPhone: `+1312555${String(Math.floor(Math.random() * 9000) + 1000)}`,
    },
  });
  made.push(shop.id);
  return shop;
}

const doneJob = (shop, data = {}) =>
  prisma.job.create({
    data: { businessId: shop.id, title: "Visit", serviceType: "AC repair", status: "completed", completedAt: new Date(), finalAmountCents: 18_000, resolutionCode: "repaired", ...data },
  });

test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test("a failed invoice write stays retryable, and repeating the retry opens one bill", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop);
  let calls = 0;
  const createInvoice = async () => {
    calls += 1;
    if (calls === 1) throw new Error("database locked");
    const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_000, status: "open", publicToken: `pay-${uid()}` } });
    return { invoice };
  };
  const failed = await settleJobBilling(job.id, { createInvoice });
  assert.equal(failed.outcome, "failed");
  assert.match(failed.error, /database locked/);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 0);
  const row = await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: job.id } });
  assert.equal(row.status, "failed");
  assert.equal(row.attempts, 1);

  const opened = await settleJobBilling(job.id, { createInvoice });
  assert.equal(opened.outcome, "succeeded");
  assert.equal(opened.created, true);
  const again = await settleJobBilling(job.id, { createInvoice });
  const third = await settleJobBilling(job.id, { createInvoice });
  assert.equal(again.outcome, "succeeded");
  assert.equal(third.outcome, "succeeded");
  assert.equal(again.invoiceId, opened.invoiceId);
  assert.equal(third.invoiceId, opened.invoiceId);
  assert.equal(calls, 2);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: opened.invoiceId } })).sentAt, null);
});

test("two workers settling the same job open one invoice", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop, { finalAmountCents: 9_500 });
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const createInvoice = async () => {
    calls += 1;
    entered();
    await gate;
    const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 9_500, status: "open", publicToken: `pay-${uid()}` } });
    return { invoice };
  };
  const first = settleJobBilling(job.id, { createInvoice });
  const second = settleJobBilling(job.id, { createInvoice });
  await started;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 1);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results.filter((result) => result.outcome === "succeeded").length, 1);
  assert.equal(results.filter((result) => result.outcome === "pending").length, 1);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
});

test("a lease still held is not taken, and an expired lease is", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop);
  await prisma.jobBilling.create({
    data: { businessId: shop.id, jobId: job.id, status: "pending", amountCents: 18_000, claimedAt: new Date(), claimToken: "held", attempts: 1 },
  });
  let calls = 0;
  const held = await settleJobBilling(job.id, {
    createInvoice: async () => {
      calls += 1;
      throw new Error("should not run");
    },
  });
  assert.equal(held.outcome, "pending");
  assert.equal(calls, 0);
  await prisma.jobBilling.update({ where: { jobId: job.id }, data: { claimedAt: new Date(Date.now() - 10 * 60_000) } });
  const createInvoice = async () => {
    calls += 1;
    const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_000, status: "open", publicToken: `pay-${uid()}` } });
    return { invoice };
  };
  const opened = await settleJobBilling(job.id, { createInvoice });
  assert.equal(opened.outcome, "succeeded");
  assert.equal(calls, 1);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
});

test("a crash after the invoice insert is recovered without a second invoice", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop);
  let calls = 0;
  const createInvoice = async () => {
    calls += 1;
    const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_000, status: "open", publicToken: `pay-${uid()}` } });
    throw new Error("process died after the invoice write");
  };
  const first = await settleJobBilling(job.id, { createInvoice });
  assert.equal(first.outcome, "succeeded");
  assert.equal(first.created, false);
  const second = await settleJobBilling(job.id, { createInvoice });
  assert.equal(second.outcome, "succeeded");
  assert.equal(second.invoiceId, first.invoiceId);
  assert.equal(calls, 1);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  assert.equal((await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: job.id } })).status, "succeeded");
});

test("no-charge work with priced lines, and a zero or negative total, never opens a bill", async () => {
  const shop = await makeShop();
  const noCharge = await prisma.job.create({ data: { businessId: shop.id, title: "Warranty", status: "on_site", serviceType: "AC repair" } });
  await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: noCharge.id, name: "Capacitor", kind: "part", quantity: 1, unitCents: 18_000 } });
  await transitionJob({ businessId: shop.id, jobId: noCharge.id, to: "completed", actor: { kind: "technician" }, via: "tech_app", completion: { resolutionCode: "repaired", noCharge: true } });
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: noCharge.id } })).finalAmountCents, 0);
  assert.equal(await prisma.invoice.count({ where: { jobId: noCharge.id } }), 0);
  assert.equal((await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: noCharge.id } })).status, "not_required");
  await settleJobBilling(noCharge.id);
  assert.equal(await prisma.invoice.count({ where: { jobId: noCharge.id } }), 0);

  const zero = await doneJob(shop, { finalAmountCents: 0 });
  assert.deepEqual(await settleJobBilling(zero.id), { outcome: "not_required", amountCents: 0 });
  assert.equal(await prisma.invoice.count({ where: { jobId: zero.id } }), 0);

  const negative = await prisma.job.create({ data: { businessId: shop.id, title: "Credit", status: "on_site", serviceType: "AC repair" } });
  await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: negative.id, name: "Visit", kind: "service", quantity: 1, unitCents: 3_000 } });
  await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: negative.id, name: "Courtesy", kind: "discount", quantity: 1, unitCents: 8_000 } });
  await transitionJob({ businessId: shop.id, jobId: negative.id, to: "completed", actor: { kind: "technician" }, via: "tech_app", completion: { resolutionCode: "repaired" } });
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: negative.id } })).finalAmountCents, -5_000);
  assert.equal(await prisma.invoice.count({ where: { jobId: negative.id } }), 0);
  assert.equal((await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: negative.id } })).status, "not_required");
});

test("a bill that was already sent is not repriced or duplicated when completion is repeated", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop, { finalAmountCents: 25_000, status: "on_site" });
  const sentAt = new Date(Date.now() - 60_000);
  const invoice = await prisma.invoice.create({
    data: { businessId: shop.id, jobId: job.id, amountCents: 10_000, status: "open", sentAt, publicToken: `sent-${uid()}` },
  });
  await transitionJob({
    businessId: shop.id,
    jobId: job.id,
    to: "completed",
    actor: { kind: "technician" },
    via: "tech_app",
    completion: { resolutionCode: "repaired", finalAmountCents: 25_000 },
  });
  const again = await transitionJob({
    businessId: shop.id,
    jobId: job.id,
    to: "completed",
    actor: owner,
    via: "dashboard",
    completion: { resolutionCode: "repaired", finalAmountCents: 25_000 },
  });
  assert.equal(again.changed, false);
  const bills = await prisma.invoice.findMany({ where: { jobId: job.id } });
  assert.equal(bills.length, 1);
  assert.equal(bills[0].id, invoice.id);
  assert.equal(bills[0].amountCents, 10_000);
  assert.equal(bills[0].sentAt.getTime(), sentAt.getTime());
  assert.equal((await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: job.id } })).status, "succeeded");
});

test("a notification failure leaves the invoice open and does not create another", async () => {
  const shop = await makeShop();
  await prisma.business.update({
    where: { id: shop.id },
    data: { autopilot: true, stripeConnectAccountId: `acct_${uid()}`, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectDetailsSubmitted: true },
  });
  const job = await doneJob(shop);
  await prisma.customer.create({ data: { businessId: shop.id, name: "Ada", phone: "+13125550199", phoneNormalized: "+13125550199" } }).then(async (customer) => {
    await prisma.job.update({ where: { id: job.id }, data: { customerId: customer.id } });
  });
  const send = async () => {
    throw new Error("twilio down");
  };
  const first = await invoiceCompletedJob(job.id, { send });
  assert.equal(first.invoiced, true);
  assert.equal(first.reason, "notify_failed");
  const billing = await prisma.jobBilling.findUniqueOrThrow({ where: { jobId: job.id } });
  assert.equal(billing.status, "succeeded");
  assert.equal(billing.notifyStatus, "failed");
  assert.match(billing.notifyError, /twilio down/);
  const second = await invoiceCompletedJob(job.id, { send });
  assert.equal(second.invoiced, true);
  assert.equal(second.invoice.id, first.invoice.id);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  assert.equal(await prisma.smsIntent.count({ where: { businessId: shop.id } }), 0);
});

test("another shop cannot settle or see the bill, and an unsigned request is refused", async () => {
  const shop = await makeShop();
  const other = await makeShop();
  const job = await doneJob(shop);
  const refused = await settleJobBilling(job.id, { businessId: other.id });
  assert.deepEqual(refused, { outcome: "skipped", reason: "not_found" });
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 0);
  assert.equal(await prisma.jobBilling.count({ where: { jobId: job.id } }), 0);

  const gaps = await listBillingExceptions(shop.id);
  assert.ok(gaps.some((row) => row.kind === "creation" && row.jobId === job.id && row.amountCents === 18_000));
  assert.equal((await listBillingExceptions(other.id)).some((row) => row.jobId === job.id), false);

  const unsigned = await billingRoute.POST(new Request("http://local.test/api/jobs/x/billing", { method: "POST" }), { params: Promise.resolve({ id: job.id }) });
  assert.equal(unsigned.status, 401);
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 0);

  const retried = await retryJobBilling({ businessId: other.id, jobId: job.id, actor: "owner", actorEmail: other.ownerEmail });
  assert.equal(retried.found, false);
  const opened = await retryJobBilling({ businessId: shop.id, jobId: job.id, actor: "owner", actorEmail: shop.ownerEmail });
  assert.equal(opened.settled.outcome, "succeeded");
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: job.id, action: "job.billing_retried" } });
  assert.ok(audit);
  assert.equal(audit.actorEmail, shop.ownerEmail);
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(invoice.sentAt, null);
  assert.equal(await prisma.smsIntent.count({ where: { businessId: shop.id } }), 0);
});

test("the desk shows a failed create, then an unsent bill, and a sweep finishes a missed one without texting", async () => {
  const shop = await makeShop();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Ada Lovelace", phone: "+13125550198", phoneNormalized: "+13125550198" } });
  const failed = await doneJob(shop, { customerId: customer.id, title: "Compressor" });
  await settleJobBilling(failed.id, {
    createInvoice: async () => {
      throw new Error("disk full");
    },
  });
  const board = await buildCommandBoard(shop.id);
  const gap = board.lanes.exceptions.find((item) => item.exception === "billing_gap" && item.jobId === failed.id);
  assert.ok(gap, "the failed create is on the board");
  assert.match(gap.detail, /Ada Lovelace|Job /);
  assert.match(gap.detail, /\$180\.00/);
  assert.match(gap.detail, /not created/);
  assert.match(gap.detail, /disk full/);
  assert.match(gap.title, /done, not billed/);

  await retryJobBilling({ businessId: shop.id, jobId: failed.id, actor: "owner", actorEmail: shop.ownerEmail });
  const after = await buildCommandBoard(shop.id);
  assert.equal(after.lanes.exceptions.some((item) => item.exception === "billing_gap" && item.jobId === failed.id), false);
  const unsent = after.lanes.exceptions.find((item) => item.exception === "invoice_unsent" && item.jobId === failed.id);
  assert.ok(unsent, "an open bill that was not texted is its own exception");
  assert.match(unsent.detail, /has not been sent/);
  assert.match(unsent.detail, /has not been paid/);
  assert.doesNotMatch(unsent.detail, /was sent/);

  const missed = await doneJob(shop, { finalAmountCents: 4_200, customerId: customer.id });
  const sweep = await sweepUnbilledJobs({ businessId: shop.id });
  assert.ok(sweep.examined >= 1);
  assert.ok(sweep.settled >= 1);
  const opened = await prisma.invoice.findFirstOrThrow({ where: { jobId: missed.id } });
  assert.equal(opened.amountCents, 4_200);
  assert.equal(opened.sentAt, null);
  assert.equal(await prisma.smsIntent.count({ where: { businessId: shop.id, eventType: "invoice.pay_link" } }), 0);

  const sent = await doneJob(shop, { customerId: customer.id, finalAmountCents: 6_000 });
  const bill = await prisma.invoice.create({ data: { businessId: shop.id, jobId: sent.id, amountCents: 6_000, status: "open", sentAt: new Date(), publicToken: `due-${uid()}` } });
  const rows = await listBillingExceptions(shop.id);
  assert.ok(rows.some((row) => row.kind === "collection" && row.invoiceId === bill.id));
  assert.equal(rows.some((row) => row.kind === "notification" && row.invoiceId === bill.id), false);

  const warranty = await doneJob(shop, { finalAmountCents: 0, customerId: customer.id });
  const stray = await prisma.invoice.create({ data: { businessId: shop.id, jobId: warranty.id, amountCents: 5_000, status: "open", publicToken: `stray-${uid()}` } });
  await settleJobBilling(warranty.id);
  const kept = await prisma.invoice.findUniqueOrThrow({ where: { id: stray.id } });
  assert.equal(kept.amountCents, 5_000);
  assert.equal(kept.status, "open");
  const mismatch = (await listBillingExceptions(shop.id)).find((row) => row.jobId === warranty.id && row.kind === "inconsistent");
  assert.ok(mismatch);
  assert.match(mismatch.lastError, /no charge/i);
});

test("a voided bill is not reopened by a retry or the sweep", async () => {
  const shop = await makeShop();
  const job = await doneJob(shop);
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_000, status: "void", publicToken: `void-${uid()}` } });
  const first = await settleJobBilling(job.id);
  const second = await settleJobBilling(job.id);
  assert.equal(first.reason, "voided");
  assert.equal(second.reason, "voided");
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "void");
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  await sweepUnbilledJobs({ businessId: shop.id });
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, "void");
});
