#!/usr/bin/env node
/*
 * Getting paid is the default: card payments going live switches deposits on
 * once, an owner's DONE 450 bills the customer, and an accepted estimate bills
 * itself when the job is marked done.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { applyPaymentsDefault, DEFAULT_DEPOSIT_CENTS, paymentsLiveText } = await import("../src/lib/payments-default.ts");
const { syncConnectAccount } = await import("../src/lib/stripe-connect.ts");
const { parseOwnerCommand, handleOwnerText } = await import("../src/lib/owner-text-commands.ts");
const { invoiceCompletedJob, fulfillInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");

const prisma = new PrismaClient();
const PREFIX = "pay-default";
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const NOW = new Date("2026-10-01T15:00:00Z");

function makeShop(overrides = {}) {
  /* "demo" with no line: texts are simulated, so a send can be proven without Twilio. */
  return prisma.business.create({
    data: {
      name: "Default Pay HVAC",
      slug: `${PREFIX}-${stamp()}`,
      environment: "demo",
      timezone: "America/Chicago",
      ownerPhone: randomPhone(),
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
}

const connected = (id) => ({
  stripeConnectAccountId: `acct_${PREFIX}_${id}`,
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
});

after(async () => {
  await prisma.business.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

test("card payments going live switch deposits on once, and tell the owner how to stop", async () => {
  const shop = await makeShop();
  const sent = [];
  const texts = { toOwner: async (msg) => (sent.push(msg), { sid: "SM_test" }) };

  assert.equal((await applyPaymentsDefault(shop.id, texts)).applied, false, "not before Stripe clears the shop");

  await prisma.business.update({ where: { id: shop.id }, data: connected(stamp()) });
  const first = await applyPaymentsDefault(shop.id, texts);
  assert.equal(first.applied, true);
  const on = await prisma.business.findUnique({ where: { id: shop.id } });
  assert.equal(on.depositEnabled, true);
  assert.equal(on.depositAmountCents, DEFAULT_DEPOSIT_CENTS);
  assert.ok(on.paymentsDefaultedAt);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].audience, "owner");
  assert.match(sent[0].body, /\$50 deposit link/);
  assert.match(sent[0].body, /DEPOSIT OFF/);

  await prisma.business.update({ where: { id: shop.id }, data: { depositEnabled: false } });
  assert.equal((await applyPaymentsDefault(shop.id, texts)).applied, false, "never runs twice");
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).depositEnabled, false, "an owner's no sticks");
  assert.equal(sent.length, 1);
});

test("a shop that already chose its deposit keeps it", async () => {
  const shop = await makeShop({ depositEnabled: false, depositAmountCents: 120_00, ...connected(stamp()) });
  const sent = [];
  const result = await applyPaymentsDefault(shop.id, { toOwner: async (m) => (sent.push(m), null) });
  assert.equal(result.applied, true);
  const kept = await prisma.business.findUnique({ where: { id: shop.id } });
  assert.equal(kept.depositEnabled, false);
  assert.equal(kept.depositAmountCents, 120_00);
  assert.doesNotMatch(sent[0].body, /deposit link/);
  assert.match(paymentsLiveText("X", 75_00), /\$75 deposit link/);
});

test("the Stripe account.updated sync is what switches payments on", async () => {
  const shop = await makeShop();
  const accountId = `acct_${PREFIX}_${stamp()}`;
  await prisma.business.update({ where: { id: shop.id }, data: { stripeConnectAccountId: accountId } });
  await syncConnectAccount({ id: accountId, metadata: { businessId: shop.id }, charges_enabled: false, payouts_enabled: false, details_submitted: true });
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).depositEnabled, false);
  await syncConnectAccount({ id: accountId, metadata: { businessId: shop.id }, charges_enabled: true, payouts_enabled: true, details_submitted: true });
  const live = await prisma.business.findUnique({ where: { id: shop.id } });
  assert.equal(live.depositEnabled, true);
  assert.ok(live.paymentsDefaultedAt);
});

test("DONE and DEPOSIT parse the way an owner types them", () => {
  assert.deepEqual(parseOwnerCommand("done"), { kind: "done", amountCents: null });
  assert.deepEqual(parseOwnerCommand("Done 450"), { kind: "done", amountCents: 45000 });
  assert.deepEqual(parseOwnerCommand("finished $1,250.50"), { kind: "done", amountCents: 125050 });
  assert.deepEqual(parseOwnerCommand("job done for 89"), { kind: "done", amountCents: 8900 });
  assert.equal(parseOwnerCommand("done 0"), null);
  assert.deepEqual(parseOwnerCommand("deposit off"), { kind: "deposit", on: false, amountCents: null });
  assert.deepEqual(parseOwnerCommand("DEPOSITS ON"), { kind: "deposit", on: true, amountCents: null });
  assert.deepEqual(parseOwnerCommand("deposit $75"), { kind: "deposit", on: true, amountCents: 7500 });
  assert.equal(parseOwnerCommand("done with this guy honestly"), null);
});

async function bookedJob(shop, jobOverrides = {}) {
  const lead = await prisma.lead.create({
    data: { businessId: shop.id, name: "Maria Lopez", phone: randomPhone(), serviceType: "No heat", status: "booked" },
  });
  const job = await prisma.job.create({
    data: {
      businessId: shop.id,
      leadId: lead.id,
      title: "Furnace repair",
      status: "on_site",
      scheduledAt: new Date(NOW.getTime() - 60 * 60_000),
      ...jobOverrides,
    },
  });
  await prisma.ownerNotification.create({
    data: {
      businessId: shop.id,
      leadId: lead.id,
      channel: "sms",
      dedupeKey: `lead:${lead.id}`,
      status: "sent",
      businessName: shop.name,
      message: "New lead",
      createdAt: new Date(NOW.getTime() - 5 * 60_000),
    },
  });
  return { lead, job };
}

const shopRef = (s) => ({ id: s.id, name: s.name, timezone: s.timezone, ownerPhone: s.ownerPhone });

test("DONE 450 finishes the job, takes off a paid deposit, and texts the bill", async () => {
  const shop = await makeShop(connected(stamp()));
  const { lead, job } = await bookedJob(shop);
  await prisma.deposit.create({
    data: { businessId: shop.id, leadId: lead.id, jobId: job.id, amountCents: 50_00, status: "paid", publicToken: `tok-${stamp()}` },
  });

  const reply = await handleOwnerText({ shop: shopRef(shop), body: "done 450", now: NOW });
  assert.equal(reply, "Done: Maria Lopez. Texted them the $400 bill with a pay link. You'll get a text when it's paid.");
  const finished = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(finished.status, "completed");
  assert.equal(finished.finalAmountCents, 450_00);
  const invoice = await prisma.invoice.findFirst({ where: { jobId: job.id } });
  assert.equal(invoice.amountCents, 400_00);
  assert.ok(invoice.sentAt);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "invoice.sent" } });
  assert.equal(audit.actor, "owner");
});

test("DONE without a total asks for one; without card payments it says what's missing", async () => {
  const bare = await makeShop(connected(stamp()));
  await bookedJob(bare);
  assert.match(await handleOwnerText({ shop: shopRef(bare), body: "done", now: NOW }), /Reply DONE 450 with the total/);

  const noCards = await makeShop();
  await bookedJob(noCards);
  assert.match(
    await handleOwnerText({ shop: shopRef(noCards), body: "done 300", now: NOW }),
    /\(\$300\)\. Card payments aren't set up yet/,
  );

  const empty = await makeShop(connected(stamp()));
  assert.match(await handleOwnerText({ shop: shopRef(empty), body: "done 300", now: NOW }), /No open job to finish/);
});

test("DEPOSIT changes the deposit by text, inside the safe range", async () => {
  const shop = await makeShop(connected(stamp()));
  const ref = shopRef(shop);
  assert.match(await handleOwnerText({ shop: ref, body: "deposit 75", now: NOW }), /Deposits on: booked customers get a \$75 deposit link/);
  let saved = await prisma.business.findUnique({ where: { id: shop.id } });
  assert.equal(saved.depositEnabled, true);
  assert.equal(saved.depositAmountCents, 75_00);

  assert.match(await handleOwnerText({ shop: ref, body: "deposit off", now: NOW }), /^Deposits off/);
  saved = await prisma.business.findUnique({ where: { id: shop.id } });
  assert.equal(saved.depositEnabled, false);
  assert.equal(saved.depositAmountCents, 75_00, "the amount is kept for DEPOSIT ON");

  assert.match(await handleOwnerText({ shop: ref, body: "deposit on", now: NOW }), /\$75 deposit link/);
  assert.match(await handleOwnerText({ shop: ref, body: "deposit 900", now: NOW }), /between \$0\.50 and \$500/);
});

test("an accepted estimate bills itself when the job is marked done, and the owner hears when it's paid", async () => {
  const shop = await makeShop(connected(stamp()));
  const { job } = await bookedJob(shop, { status: "completed", completedAt: NOW });
  await prisma.estimate.create({
    data: { businessId: shop.id, jobId: job.id, amountCents: 680_00, status: "accepted", acceptedAt: NOW },
  });
  const billed = await invoiceCompletedJob(job.id);
  assert.equal(billed.invoiced, true);
  assert.equal(billed.invoice.amountCents, 680_00);
  assert.equal(billed.sms?.sent, true);

  const result = await fulfillInvoiceCheckoutSession({
    id: `cs_test_${billed.invoice.id}`,
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 680_00,
    metadata: { kind: "invoice_pay", invoiceId: billed.invoice.id, businessId: shop.id },
  });
  assert.equal(result.ok, true);
  const ownerTexts = await prisma.outboundSms.count({ where: { businessId: shop.id, audience: "owner" } });
  assert.equal(ownerTexts, 1, "the owner is texted the moment the customer pays");
});
