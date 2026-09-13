/*
 * The deposit is the first thing Orvius does that moves a customer's money, so
 * these tests drive the real functions against the real database rather than
 * asserting on a mirrored copy of their logic.
 *
 * Three failures here are the expensive ones. Opening the card path before
 * Stripe has cleared a shop bounces the customer's card at the worst possible
 * moment. A non-idempotent fulfilment double-charges, or double-records, when
 * the webhook and the customer's own redirect race — which they routinely do.
 * And a deposit created twice for one call asks a stranger to pay twice.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  MAX_DEPOSIT_CENTS,
  createDepositForLead,
  fulfillDepositCheckoutSession,
  getDepositReadiness,
  isDepositAmountValid,
  resolveDepositAmountCents,
} from "../src/lib/booking-deposit.ts";
import { getConnectStatus } from "../src/lib/stripe-connect.ts";

const prisma = new PrismaClient();

/** A shop cleared by Stripe to charge cards. */
const CLEARED = {
  stripeConnectAccountId: "acct_test_cleared",
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
};

async function makeShop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Deposit Proof Plumbing",
      slug: `deposit-proof-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      billingStatus: "pilot",
      ...overrides,
    },
  });
}

async function makeLead(businessId, overrides = {}) {
  return prisma.lead.create({
    data: {
      businessId,
      name: "Dana Caller",
      phone: "+15555550222",
      serviceType: "No heat",
      urgency: "emergency",
      ...overrides,
    },
  });
}

test("only Stripe's charges verdict opens the card path", () => {
  assert.equal(
    getConnectStatus({
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    }).state,
    "not_started",
  );

  // Account exists, owner has not finished the form.
  assert.equal(
    getConnectStatus({
      stripeConnectAccountId: "acct_1",
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    }).state,
    "in_progress",
  );

  /*
    The case that matters: every detail submitted but Stripe has not cleared
    the account. Treating this as ready is what bounces a customer's card.
  */
  const submittedNotCleared = getConnectStatus({
    stripeConnectAccountId: "acct_1",
    stripeConnectChargesEnabled: false,
    stripeConnectPayoutsEnabled: false,
    stripeConnectDetailsSubmitted: true,
  });
  assert.equal(submittedNotCleared.state, "verifying");
  assert.equal(submittedNotCleared.canAcceptPayments, false);

  const cleared = getConnectStatus(CLEARED);
  assert.equal(cleared.state, "ready");
  assert.equal(cleared.canAcceptPayments, true);
});

test("charges enabled without an account id still cannot take a card", () => {
  /*
    Not reachable through the normal flow, but it is the one combination where
    a truthy flag would otherwise be trusted with no account to charge against.
  */
  const status = getConnectStatus({
    stripeConnectAccountId: null,
    stripeConnectChargesEnabled: true,
    stripeConnectPayoutsEnabled: true,
    stripeConnectDetailsSubmitted: true,
  });
  assert.equal(status.canAcceptPayments, false);
});

test("deposit amounts outside Stripe's and sanity bounds are rejected", () => {
  assert.equal(isDepositAmountValid(49), false, "under Stripe's 50c floor");
  assert.equal(isDepositAmountValid(50), true);
  assert.equal(isDepositAmountValid(9_900), true);
  assert.equal(isDepositAmountValid(MAX_DEPOSIT_CENTS), true);
  assert.equal(isDepositAmountValid(MAX_DEPOSIT_CENTS + 1), false);
  assert.equal(isDepositAmountValid(99.5), false, "fractional cents");
});

test("the shop's deposit setting is off unless both fields agree", () => {
  assert.equal(
    resolveDepositAmountCents({ depositEnabled: false, depositAmountCents: 9_900 }),
    null,
  );
  assert.equal(
    resolveDepositAmountCents({ depositEnabled: true, depositAmountCents: null }),
    null,
  );
  // A bad stored amount must not become a charge attempt.
  assert.equal(
    resolveDepositAmountCents({ depositEnabled: true, depositAmountCents: 5 }),
    null,
  );
  assert.equal(
    resolveDepositAmountCents({ depositEnabled: true, depositAmountCents: 9_900 }),
    9_900,
  );
});

test("readiness names the blocker so the UI can act on it", () => {
  assert.deepEqual(
    getDepositReadiness({
      ...CLEARED,
      depositEnabled: false,
      depositAmountCents: null,
    }),
    { ready: false, reason: "deposits_off" },
  );

  assert.deepEqual(
    getDepositReadiness({
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
      depositEnabled: true,
      depositAmountCents: 9_900,
    }),
    { ready: false, reason: "connect_incomplete" },
  );

  assert.deepEqual(
    getDepositReadiness({
      ...CLEARED,
      depositEnabled: true,
      depositAmountCents: 9_900,
    }),
    { ready: true, amountCents: 9_900 },
  );
});

test("a second request for the same lead reuses the deposit", async () => {
  const shop = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);

  const first = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9_900,
  });
  assert.equal(first.created, true);
  assert.ok(first.deposit.publicToken, "needs a token to be payable");

  const second = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9_900,
  });
  assert.equal(second.created, false);
  assert.equal(second.deposit.id, first.deposit.id);

  const all = await prisma.deposit.findMany({ where: { leadId: lead.id } });
  assert.equal(all.length, 1, "customer would have been asked to pay twice");
});

test("a canceled deposit does not block asking again", async () => {
  const shop = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);

  const first = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9_900,
  });
  await prisma.deposit.update({
    where: { id: first.deposit.id },
    data: { status: "canceled" },
  });

  const retry = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 12_500,
  });
  assert.equal(retry.created, true);
  assert.notEqual(retry.deposit.id, first.deposit.id);
  assert.equal(retry.deposit.amountCents, 12_500);
});

test("an out-of-range amount never reaches the database", async () => {
  const shop = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);

  await assert.rejects(
    () =>
      createDepositForLead({
        businessId: shop.id,
        leadId: lead.id,
        amountCents: 1,
      }),
    /out of range/,
  );

  const all = await prisma.deposit.findMany({ where: { leadId: lead.id } });
  assert.equal(all.length, 0);
});

/** A Checkout session as the webhook and the redirect both see it. */
function paidSession(deposit, businessId, overrides = {}) {
  return {
    id: `cs_test_${deposit.id}`,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: deposit.amountCents,
    payment_intent: `pi_test_${deposit.id}`,
    metadata: {
      kind: "booking_deposit",
      depositId: deposit.id,
      businessId,
      publicToken: deposit.publicToken,
    },
    ...overrides,
  };
}

test("fulfilment marks the deposit paid and stamps what Orvius earned", async () => {
  const shop = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);
  const { deposit } = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 45_000,
  });

  const result = await fulfillDepositCheckoutSession(
    paidSession(deposit, shop.id),
  );
  assert.equal(result.ok, true);

  const stored = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  assert.equal(stored.status, "paid");
  assert.ok(stored.paidAt, "paidAt anchors the appointment hold");
  assert.equal(stored.stripePaymentIntentId, `pi_test_${deposit.id}`);
  // 2% of $450.
  assert.equal(stored.applicationFeeCents, 900);
});

test("a replayed webhook is a no-op, not a second payment", async () => {
  const shop = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);
  const { deposit } = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9_900,
  });

  const session = paidSession(deposit, shop.id);
  const first = await fulfillDepositCheckoutSession(session);
  const second = await fulfillDepositCheckoutSession(session);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.reason, "already_paid");

  const stored = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  const firstPaidAt = stored.paidAt.getTime();
  assert.ok(Number.isFinite(firstPaidAt));

  // The second call must not have moved the paid timestamp.
  const again = await fulfillDepositCheckoutSession(session);
  assert.equal(again.reason, "already_paid");
  const after = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  assert.equal(after.paidAt.getTime(), firstPaidAt);
});

test("an unpaid or foreign session cannot mark a deposit paid", async () => {
  const shop = await makeShop(CLEARED);
  const other = await makeShop(CLEARED);
  const lead = await makeLead(shop.id);
  const { deposit } = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9_900,
  });

  const unpaid = await fulfillDepositCheckoutSession(
    paidSession(deposit, shop.id, { payment_status: "unpaid", status: "open" }),
  );
  assert.equal(unpaid.ok, false);
  assert.equal(unpaid.reason, "not_paid");

  const wrongKind = await fulfillDepositCheckoutSession({
    ...paidSession(deposit, shop.id),
    metadata: { kind: "estimate_pay" },
  });
  assert.equal(wrongKind.reason, "not_booking_deposit");

  /*
    Tenant scoping on the money path: a session naming another shop must not
    resolve this shop's deposit even though the deposit id is correct.
  */
  const crossTenant = await fulfillDepositCheckoutSession(
    paidSession(deposit, other.id),
  );
  assert.equal(crossTenant.ok, false);
  assert.equal(crossTenant.reason, "deposit_not_found");

  const stored = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  assert.equal(stored.status, "pending");
});

test.after(async () => {
  await prisma.$disconnect();
});
