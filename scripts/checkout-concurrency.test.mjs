#!/usr/bin/env node
/*
 * One bill, one open checkout, one invoice — under concurrency, against the
 * real database and a mocked Stripe that behaves like Stripe on idempotency
 * keys. Also: the webhook racing the customer's return, a session claiming
 * another shop's invoice, and money landing on a shop that is now a demo.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.ORVIUS_FOUNDER_PHONE;

const created = [];
const byKey = new Map();
const sessions = new Map();
let failNextAfterCreate = false;
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, {
  namedExports: {
    ...realStripe,
    getStripe: () => ({
      checkout: {
        sessions: {
          create: async (params, options) => {
            await new Promise((r) => setTimeout(r, 20));
            if (options?.idempotencyKey && byKey.has(options.idempotencyKey)) return byKey.get(options.idempotencyKey);
            const session = { id: `cs_mock_${created.length + 1}`, status: "open", url: "https://checkout.stripe.test/s", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata };
            created.push({ params, options });
            sessions.set(session.id, session);
            if (options?.idempotencyKey) byKey.set(options.idempotencyKey, session);
            if (failNextAfterCreate) {
              failNextAfterCreate = false;
              throw new Error("socket hang up");
            }
            return session;
          },
          retrieve: async (id) => {
            const s = sessions.get(id);
            if (!s) throw new Error("No such session");
            return s;
          },
          expire: async (id) => {
            sessions.get(id).status = "expired";
            return sessions.get(id);
          },
        },
      },
      refunds: { create: async () => assert.fail("no refund is issued in these checks") },
    }),
  },
});
process.env.STRIPE_SECRET_KEY ||= "sk_test_mock_only";

const { createInvoiceCheckoutSession, fulfillInvoiceCheckoutSession, upsertJobInvoice } = await import("../src/lib/invoice-pay.ts");
const { createDepositCheckoutSession, fulfillDepositCheckoutSession } = await import("../src/lib/booking-deposit.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const made = [];
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const CONNECTED = () => ({ stripeConnectAccountId: `acct_mock_${uid()}`, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectDetailsSubmitted: true });

async function makeShop(data = {}) {
  const shop = await prisma.business.create({
    data: { name: "Race Heating", slug: `race-${uid()}`, environment: "test", billingStatus: "active", ownerEmail: `o-${uid()}@example.test`, ...CONNECTED(), ...data },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("two completions of one job at once make one invoice; a paid one is never re-priced; another shop's job is its own", async () => {
  const shop = await makeShop();
  const job = await prisma.job.create({ data: { businessId: shop.id, title: "Furnace repair" } });
  const results = await Promise.all(Array.from({ length: 5 }, () => upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 48_000 })));
  assert.equal(await prisma.invoice.count({ where: { jobId: job.id } }), 1);
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.invoice.id)).size, 1);

  await prisma.invoice.updateMany({ where: { jobId: job.id }, data: { status: "paid", paidAt: new Date() } });
  const after = await upsertJobInvoice({ businessId: shop.id, jobId: job.id, totalCents: 99_000 });
  assert.equal(after.invoice.amountCents, 48_000, "an adjustment never rewrites a paid bill");

  const other = await makeShop();
  const otherJob = await prisma.job.create({ data: { businessId: other.id, title: "AC repair" } });
  const theirs = await upsertJobInvoice({ businessId: other.id, jobId: otherJob.id, totalCents: 20_000 });
  assert.equal(theirs.created, true);
  assert.notEqual(theirs.invoice.id, after.invoice.id);
});

test("five Pay taps open one Stripe session per bill and amount; a re-priced bill gets a fresh one", async () => {
  const shop = await makeShop();
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 42_000, status: "open", publicToken: `tok-${uid()}` } });
  const before = created.length;
  const taps = await Promise.all(Array.from({ length: 5 }, () => createInvoiceCheckoutSession({ invoice, business: shop })));
  assert.equal(created.length - before, 1, "one session created at Stripe");
  assert.equal(new Set(taps.map((s) => s.id)).size, 1);
  assert.match(created.at(-1).options.idempotencyKey, new RegExp(`^checkout:invoice:${invoice.id}:42000:first$`));
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).openCheckoutSessionId, taps[0].id);

  await prisma.invoice.update({ where: { id: invoice.id }, data: { amountCents: 45_000 } });
  const repriced = await createInvoiceCheckoutSession({ invoice: { ...invoice, amountCents: 45_000 }, business: shop });
  assert.notEqual(repriced.id, taps[0].id);
  assert.equal(sessions.get(taps[0].id).status, "expired", "the stale-amount session is closed, not left payable");
});

test("a Stripe call that succeeded but timed out is retried into the same session, not a second one", async () => {
  const shop = await makeShop();
  const deposit = await prisma.deposit.create({ data: { businessId: shop.id, amountCents: 7_500, status: "pending", publicToken: `dtok-${uid()}` } });
  failNextAfterCreate = true;
  await assert.rejects(createDepositCheckoutSession({ deposit, business: shop }), /socket hang up/);
  const before = created.length;
  const retry = await createDepositCheckoutSession({ deposit, business: shop });
  assert.equal(created.length, before, "the idempotency key returned the session Stripe already made");
  assert.equal((await prisma.deposit.findUnique({ where: { id: deposit.id } })).stripeSessionId, retry.id);
});

test("webhook and return replay record once; a session naming another shop's invoice records nothing", async () => {
  const shop = await makeShop();
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 30_000, status: "open", publicToken: `tok-${uid()}` } });
  const paid = { id: `cs_paid_${uid()}`, payment_status: "paid", status: "complete", amount_total: 30_000, metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: shop.id } };
  const both = await Promise.all([fulfillInvoiceCheckoutSession(paid), fulfillInvoiceCheckoutSession(paid)]);
  assert.equal(both.filter((r) => r.ok && !r.reason).length, 1);
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");

  const intruder = await makeShop();
  const victim = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 10_000, status: "open", publicToken: `tok-${uid()}` } });
  const forged = { id: `cs_forged_${uid()}`, payment_status: "paid", status: "complete", amount_total: 10_000, metadata: { kind: "invoice_pay", invoiceId: victim.id, businessId: intruder.id } };
  assert.equal((await fulfillInvoiceCheckoutSession(forged)).reason, "invoice_not_found");
  assert.equal(await prisma.payment.count({ where: { invoiceId: victim.id } }), 0);

  const unpaid = { ...paid, id: `cs_open_${uid()}`, payment_status: "unpaid" };
  assert.equal((await fulfillInvoiceCheckoutSession(unpaid)).reason, "not_paid", "an opened checkout is not a payment");
});

test("money landing on a shop that is now a demo is recorded, follow-ups held, refunds held, and the trail says so", async () => {
  const shop = await makeShop({ environment: "demo", slug: `demo-${uid()}`, ownerPhone: "+15125550142" });
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 30_000, status: "open", publicToken: `tok-${uid()}` } });
  const paid = { id: `cs_demo_${uid()}`, payment_status: "paid", status: "complete", amount_total: 30_000, metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: shop.id } };
  assert.equal((await fulfillInvoiceCheckoutSession(paid)).reason, "held_in_demo");
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid", "the receipt is not hidden");
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
  assert.equal(await prisma.message.count({ where: { businessId: shop.id } }), 0, "no paid text, real or simulated");

  const second = { ...paid, id: `cs_demo2_${uid()}` };
  assert.equal((await fulfillInvoiceCheckoutSession(second)).reason, "duplicate_held", "no live refund from a demo; a person reconciles");

  const deposit = await prisma.deposit.create({ data: { businessId: shop.id, amountCents: 5_000, status: "pending", publicToken: `dtok-${uid()}` } });
  const dep = { id: `cs_dep_${uid()}`, payment_status: "paid", status: "complete", amount_total: 5_000, metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: shop.id } };
  assert.equal((await fulfillDepositCheckoutSession(dep)).reason, "held_in_demo");
  assert.equal((await prisma.deposit.findUnique({ where: { id: deposit.id } })).status, "paid");

  const trail = await prisma.auditEvent.findMany({ where: { businessId: shop.id, action: "payment.held_in_demo" } });
  assert.equal(trail.length, 3);
  assert.ok(trail.every((e) => /Orvius reviews it/.test(e.summary)));
});
