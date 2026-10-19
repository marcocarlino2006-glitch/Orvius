#!/usr/bin/env node
/*
 * A customer pays once, for what they owe. The expensive failures this guards:
 * a bill paid twice with the second charge silently kept, the full total
 * charged after cash already came in, a booking deposit charged again inside
 * an estimate, a bank debit counted before it cleared, a refund that marks
 * cash refunded, and referral credit kept after the referred shop's refund.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import { applyCardPaymentToInvoice, fulfillInvoiceCheckoutSession, invoiceOpenBalanceCents } from "../src/lib/invoice-pay.ts";
import { fulfillEstimateCheckoutSession } from "../src/lib/estimate-pay.ts";
import { fulfillDepositCheckoutSession } from "../src/lib/booking-deposit.ts";
import { pricedJobInvoice } from "../src/lib/invoice-tax.ts";
import { applyChargeRefund } from "../src/lib/payment-refund.ts";
import { creditReferralOnPayment, reverseReferralCredit } from "../src/lib/referrals.ts";
import { checkoutSessionPaid } from "../src/lib/checkout-guard.ts";
import { prisma } from "../src/lib/prisma.ts";

const read = (path) => readFileSync(path, "utf8");
let n = 0;
const uid = (p) => `${p}-${Date.now()}-${n++}`;
const shops = [];

async function makeShop(data = {}) {
  const shop = await prisma.business.create({ data: { name: "Money Safety HVAC", slug: uid("money"), environment: "test", ...data } });
  shops.push(shop.id);
  return shop;
}

async function makeInvoice(shop, amountCents, data = {}) {
  const job = await prisma.job.create({ data: { businessId: shop.id, title: "Furnace repair" } });
  const invoice = await prisma.invoice.create({
    data: { businessId: shop.id, jobId: job.id, amountCents, status: "open", publicToken: uid("tok"), ...data },
  });
  return { job, invoice };
}

const session = (invoice, shop, overrides = {}) => ({
  id: uid("cs_test"),
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  payment_intent: uid("pi"),
  amount_total: invoice.amountCents,
  metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: shop.id, publicToken: invoice.publicToken },
  ...overrides,
});

after(async () => {
  for (const id of shops) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test("only cleared money counts: a bank debit that completed unpaid changes nothing", async () => {
  assert.equal(checkoutSessionPaid({ payment_status: "paid" }), true);
  assert.equal(checkoutSessionPaid({ payment_status: "unpaid" }), false);
  const shop = await makeShop();
  const { invoice } = await makeInvoice(shop, 40_000);
  const result = await fulfillInvoiceCheckoutSession(session(invoice, shop, { payment_status: "unpaid" }));
  assert.equal(result.reason, "not_paid");
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "open");
  const webhook = read("src/app/api/billing/webhook/route.ts");
  assert.match(webhook, /case "checkout\.session\.async_payment_succeeded":\s*\n\s*case "checkout\.session\.completed":/);
  assert.match(webhook, /case "checkout\.session\.async_payment_failed":\s*\n\s*case "checkout\.session\.expired":/);
});

test("a second payment on a settled invoice is held as an owner exception, never counted or refunded on its own", async () => {
  const shop = await makeShop({ ownerPhone: "+15550002222", ownerEmail: `${uid("o")}@example.test` });
  const { invoice } = await makeInvoice(shop, 40_000);
  const first = session(invoice, shop);
  assert.deepEqual(await fulfillInvoiceCheckoutSession(first), { ok: true });
  assert.equal((await fulfillInvoiceCheckoutSession(first)).reason, "already_paid", "the redirect racing the webhook is a replay");

  const second = session(invoice, shop);
  assert.equal((await fulfillInvoiceCheckoutSession(second)).reason, "late_payment_held");
  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
  assert.equal(payments.length, 1, "the second charge is not counted as money in");
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, dedupeKey: `late-payment:${second.id}` } });
  assert.ok(alert, "the owner is told about the extra charge");
  assert.match(alert.message, /paid the invoice again after it was settled/);
  assert.match(alert.message, /Nothing was refunded automatically/);
  const exception = await prisma.reconciliationException.findFirst({ where: { businessId: shop.id, entityId: invoice.id } });
  assert.ok(exception, "the extra payment is an open reconciliation exception");
  assert.equal(exception.externalId, second.id);
});

test("the webhook and the redirect racing on one session record it once", async () => {
  const shop = await makeShop();
  const { invoice } = await makeInvoice(shop, 25_000);
  const s = session(invoice, shop);
  await Promise.all([fulfillInvoiceCheckoutSession(s), fulfillInvoiceCheckoutSession(s)]);
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
});

test("cash already in comes off the balance, and a short payment leaves the invoice part-paid", async () => {
  const shop = await makeShop();
  const { invoice } = await makeInvoice(shop, 50_000, { status: "partial" });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 20_000, status: "recorded", method: "cash" } });
  const loaded = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { payments: true } });
  assert.equal(invoiceOpenBalanceCents(loaded), 30_000);

  const short = session(invoice, shop, { amount_total: 10_000 });
  await fulfillInvoiceCheckoutSession(short);
  let row = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  assert.equal(row.status, "partial", "a stale session for less than owed doesn't mark it paid");
  assert.equal(row.paidAt, null);

  await fulfillInvoiceCheckoutSession(session(invoice, shop, { amount_total: 20_000 }));
  row = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  assert.equal(row.status, "paid");
  assert.ok(row.paidAt);
  const route = read("src/app/api/public/invoice/[token]/route.ts");
  assert.match(route, /amountLabel: formatCentsExact\(paid \? invoice\.amountCents : balanceCents\)/, "the pay page shows what's owed");
  assert.match(read("src/lib/invoice-pay.ts"), /unit_amount: balanceCents/, "and Checkout charges it");
});

test("an estimate paid by card credits the deposit, stamps paidAt and the fee, and counts once", async () => {
  const shop = await makeShop();
  const lead = await prisma.lead.create({ data: { businessId: shop.id, phone: "+15550003333" } });
  const job = await prisma.job.create({ data: { businessId: shop.id, leadId: lead.id, title: "New furnace" } });
  await prisma.deposit.create({ data: { businessId: shop.id, leadId: lead.id, amountCents: 10_000, status: "paid" } });
  const priced = await pricedJobInvoice(shop.id, job.id, 100_000);
  assert.equal(priced.amountCents, 90_000, "the deposit 'applied to your final bill' is applied");

  const estimate = await prisma.estimate.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 100_000, status: "sent", publicToken: uid("est") } });
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, estimateId: estimate.id, ...priced, status: "open" } });
  const s = {
    ...session(invoice, shop),
    metadata: { kind: "estimate_pay", estimateId: estimate.id, invoiceId: invoice.id, businessId: shop.id, publicToken: estimate.publicToken, applicationFeeCents: "900" },
  };
  await Promise.all([fulfillEstimateCheckoutSession(s), fulfillEstimateCheckoutSession(s)]);
  const row = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { payments: true } });
  assert.equal(row.payments.length, 1);
  assert.equal(row.status, "paid");
  assert.ok(row.paidAt, "reports that filter on paidAt see estimate revenue");
  assert.equal(row.applicationFeeCents, 900);
  assert.equal((await prisma.estimate.findUnique({ where: { id: estimate.id } })).status, "accepted");
  assert.match(read("src/lib/estimate-pay.ts"), /network \? calculateNetworkFeeCents\(workCents\)/, "network jobs pay the network fee on estimates too");
});

test("refunding one card payment leaves cash collected, and refunding a duplicate changes nothing", async () => {
  const shop = await makeShop({ stripeConnectAccountId: uid("acct") });
  const { invoice } = await makeInvoice(shop, 50_000);
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 20_000, status: "recorded", method: "cash" } });
  const card = session(invoice, shop, { amount_total: 30_000 });
  await applyCardPaymentToInvoice({ session: card, invoiceId: invoice.id, businessId: shop.id, network: false, chargedFeeCents: 300 });
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");

  const meta = { kind: "invoice_pay", invoiceId: invoice.id, businessId: shop.id };
  const dup = await applyChargeRefund({ metadata: meta, amountRefundedCents: 30_000, fullyRefunded: true, chargeId: uid("ch"), sessionId: uid("cs_other"), account: shop.stripeConnectAccountId });
  assert.equal(dup.reason, "duplicate_charge");
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");

  await applyChargeRefund({ metadata: meta, amountRefundedCents: 30_000, fullyRefunded: true, chargeId: uid("ch"), sessionId: card.id, account: shop.stripeConnectAccountId });
  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
  assert.equal(payments.find((p) => p.method === "cash").status, "recorded", "cash stays collected");
  assert.equal(payments.find((p) => p.method === `stripe:${card.id}`).status, "refunded");
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "partial", "the card part is owed again");
});

test("a deposit paid twice keeps the first payment and holds the second for the owner; refunding that one leaves the deposit paid", async () => {
  const shop = await makeShop({ ownerPhone: "+15550004444", stripeConnectAccountId: uid("acct") });
  const deposit = await prisma.deposit.create({ data: { businessId: shop.id, amountCents: 7_500, status: "pending", publicToken: uid("dep") } });
  const base = { mode: "payment", status: "complete", payment_status: "paid", amount_total: 7_500, metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: shop.id } };
  const first = { ...base, id: uid("cs_a"), payment_intent: uid("pi_a") };
  const second = { ...base, id: uid("cs_b"), payment_intent: uid("pi_b") };
  assert.equal((await fulfillDepositCheckoutSession(first)).ok, true);
  assert.equal((await fulfillDepositCheckoutSession(first)).reason, "already_paid");
  assert.equal((await fulfillDepositCheckoutSession(second)).reason, "late_payment_held");
  assert.ok(await prisma.reconciliationException.findFirst({ where: { businessId: shop.id, entityId: deposit.id, externalId: second.id } }));

  const refund = await applyChargeRefund({
    metadata: base.metadata,
    amountRefundedCents: 7_500,
    fullyRefunded: true,
    chargeId: uid("ch"),
    paymentIntentId: second.payment_intent,
    account: shop.stripeConnectAccountId,
  });
  assert.equal(refund.reason, "duplicate_charge");
  assert.equal((await prisma.deposit.findUnique({ where: { id: deposit.id } })).status, "paid");
});

test("referral credit is capped at what the referred shop paid, and comes back if it takes its money back", async () => {
  const referrer = await makeShop({ billingStatus: "active", billingPlan: "fleet", stripeSubscriptionId: uid("sub"), stripeCustomerId: uid("cus_ref") });
  const referred = await makeShop({ stripeCustomerId: uid("cus_new") });
  await prisma.referral.create({ data: { referrerId: referrer.id, referredId: referred.id } });
  const balance = [];
  const stripe = { customers: { createBalanceTransaction: async (_customer, body) => { balance.push(body.amount); return { id: uid("cbtxn") }; } } };

  const credited = await creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 9_900 }, { stripe, notify: async () => null });
  assert.equal(credited.creditCents, 9_900, "a Line month earns a Line month, not a Fleet month");
  const reversed = await reverseReferralCredit(referred.id, { stripe });
  assert.equal(reversed.status, "reversed");
  assert.deepEqual(balance, [-9_900, 9_900]);
  assert.match(read("src/app/api/billing/money-back/route.ts"), /reverseReferralCredit\(business\.id\)/);
});

test("subscription events apply Stripe's current state, overage checks Stripe before billing, and only one plan checkout stays open", () => {
  const webhook = read("src/app/api/billing/webhook/route.ts");
  const subs = webhook.slice(webhook.indexOf('case "customer.subscription.updated":'));
  assert.match(subs.slice(0, 1200), /stripe\.subscriptions\.retrieve\(snapshot\.id/);
  const overage = read("src/lib/overage-billing.ts");
  assert.ok(overage.indexOf("stripe.invoices.list(") < overage.indexOf("stripe.invoiceItems.create("));
  assert.match(overage, /invoiceItems\.list\(\{ customer: shop\.stripeCustomerId!, pending: true/);
  const checkout = read("src/app/api/billing/checkout/route.ts");
  assert.ok(checkout.indexOf("await expireOpenPlanCheckouts(") < checkout.indexOf("stripe.checkout.sessions.create("));
});
