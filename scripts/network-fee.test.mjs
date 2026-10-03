#!/usr/bin/env node
/*
 * The Orvius Network's fee: a network job's card bill carries 5%, and half of
 * it is credited — once — to the shop that passed the job.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { calculateNetworkFeeCents, calculatePlatformFeeCents, networkSenderCreditCents } = await import("../src/lib/platform-fee.ts");
const { creditNetworkSender } = await import("../src/lib/orvius-network.ts");
const { fulfillInvoiceCheckoutSession, isNetworkJob } = await import("../src/lib/invoice-pay.ts");

const prisma = new PrismaClient();
const PREFIX = "network-fee";
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

after(async () => {
  await prisma.business.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

async function passedJob(senderOverrides = {}) {
  const sender = await prisma.business.create({
    data: {
      name: "Passing Plumbing",
      slug: `${PREFIX}-${stamp()}`,
      ownerPhone: "+15555550131",
      billingStatus: "active",
      billingPlan: "pro",
      stripeCustomerId: `cus_${stamp()}`,
      stripeSubscriptionId: `sub_${stamp()}`,
      ...senderOverrides,
    },
  });
  const receiver = await prisma.business.create({ data: { name: "Taking Plumbing", slug: `${PREFIX}-${stamp()}` } });
  const sourceLead = await prisma.lead.create({ data: { businessId: sender.id, name: "Ava Reed", phone: "+15555550132", status: "lost" } });
  const lead = await prisma.lead.create({
    data: { businessId: receiver.id, name: "Ava Reed", phone: "+15555550132", source: "network", status: "booked" },
  });
  const job = await prisma.job.create({ data: { businessId: receiver.id, leadId: lead.id, title: "Water heater", status: "completed" } });
  const handoff = await prisma.networkHandoff.create({
    data: {
      fromBusinessId: sender.id,
      leadId: sourceLead.id,
      callerPhone: "+15555550132",
      callerPhoneNormalized: "+15555550132",
      trade: "plumbing",
      zip3: "606",
      status: "taken",
      toBusinessId: receiver.id,
      toLeadId: lead.id,
      takenAt: new Date(),
    },
  });
  return { sender, receiver, job, handoff };
}

test("a network bill carries 5%; the passing shop's share is half", () => {
  assert.equal(calculateNetworkFeeCents(1_200_00), 60_00);
  assert.equal(networkSenderCreditCents(1_200_00), 30_00);
  assert.equal(calculatePlatformFeeCents(1_200_00), 12_00, "ordinary jobs keep the ordinary fee");
  assert.equal(calculateNetworkFeeCents(0), 0);
});

test("the passing shop is credited once, on its Orvius bill, and told", async () => {
  const { sender, job, handoff } = await passedJob();
  assert.equal(await isNetworkJob(job.id), true);

  const calls = [];
  const texts = [];
  const stripe = { customers: { createBalanceTransaction: async (...args) => (calls.push(args), { id: "cbtxn_test" }) } };
  const notify = async (m) => (texts.push(m), { sid: "SM_test" });

  const first = await creditNetworkSender({ jobId: job.id, amountCents: 1_200_00 }, { stripe, notify });
  assert.deepEqual(first, { status: "credited", creditCents: 30_00 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], sender.stripeCustomerId);
  assert.equal(calls[0][1].amount, -30_00);
  assert.deepEqual(calls[0][2], { idempotencyKey: `network-credit:${handoff.id}` });
  assert.match(texts[0].body, /Taking Plumbing finished the job you passed and got paid\. \$30\.00 is credited/);

  const again = await creditNetworkSender({ jobId: job.id, amountCents: 1_200_00 }, { stripe, notify });
  assert.equal(again.status, "skipped");
  assert.equal(calls.length, 1, "a retried webhook never credits twice");
  const saved = await prisma.networkHandoff.findUnique({ where: { id: handoff.id } });
  assert.equal(saved.creditStatus, "credited");
  assert.equal(saved.creditCents, 30_00);
});

test("a Stripe failure leaves the credit claimable; a non-paying sender is voided", async () => {
  const { job, handoff } = await passedJob();
  const failing = { customers: { createBalanceTransaction: async () => { throw new Error("stripe down"); } } };
  await assert.rejects(creditNetworkSender({ jobId: job.id, amountCents: 500_00 }, { stripe: failing }), /stripe down/);
  assert.equal((await prisma.networkHandoff.findUnique({ where: { id: handoff.id } })).creditStatus, null);

  const unpaid = await passedJob({ stripeCustomerId: null, billingStatus: "canceled" });
  assert.equal((await creditNetworkSender({ jobId: unpaid.job.id, amountCents: 500_00 })).status, "void");
});

test("paying a network invoice records the 5% fee that was charged", async () => {
  const { receiver, job, handoff } = await passedJob({ stripeCustomerId: null, billingStatus: "canceled" });
  const invoice = await prisma.invoice.create({
    data: { businessId: receiver.id, jobId: job.id, amountCents: 800_00, status: "open", publicToken: `tok-${stamp()}` },
  });
  const result = await fulfillInvoiceCheckoutSession({
    id: `cs_test_${invoice.id}`,
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 800_00,
    metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: receiver.id, applicationFeeCents: "4000", network: "1" },
  });
  assert.equal(result.ok, true);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).applicationFeeCents, 40_00);
  assert.equal((await prisma.networkHandoff.findUnique({ where: { id: handoff.id } })).creditStatus, "void", "the credit step ran");
});
