import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { performOnce } from "@/lib/provider-effect";
import { MONEY_BACK_MARK, moneyBackState, type MoneyBackFacts, type MoneyBackReason, type MoneyBackState } from "@/lib/money-back";

/*
  The Stripe side of the first-month offer. Server only: each refund and the
  plan cancel are recorded as provider effects, so a lost reply is checked at
  Stripe before anything is sent again and a stuck one is flagged to a person.
*/

const MONEY_BACK_PENDING = "orvius_money_back_pending";

type Charge = { id: string; amount: number; amount_refunded: number; paid: boolean; status: string; created: number };
type Subscription = { id: string; status: string; start_date: number; created: number };

/** The slice of the Stripe client the offer uses, so tests can stand in for it. */
export type MoneyBackStripe = {
  customers: {
    retrieve(id: string): Promise<{ deleted?: boolean; metadata?: Record<string, string> | null }>;
    update(id: string, params: { metadata: Record<string, string> }): Promise<unknown>;
  };
  subscriptions: {
    retrieve(id: string): Promise<Subscription>;
    list(params: { customer: string; status: "all"; limit: number }): Promise<{ data: Subscription[] }>;
    cancel(id: string, params: { invoice_now: boolean; prorate: boolean }): Promise<Subscription>;
  };
  charges: {
    list(params: { customer: string; created: { gte: number }; limit: number }): Promise<{ data: Charge[] }>;
  };
  refunds: {
    create(
      params: { charge: string; amount: number; reason: "requested_by_customer"; metadata: Record<string, string> },
      options: { idempotencyKey: string },
    ): Promise<Refund>;
    retrieve(id: string): Promise<Refund>;
    list(params: { charge: string; limit: number }): Promise<{ data: Refund[] }>;
  };
};

type Refund = { id: string; amount: number; metadata?: Record<string, string> | null };

export type MoneyBackAccount = { customerId: string; subscriptionId: string; businessId: string };

async function readFacts(stripe: MoneyBackStripe, account: MoneyBackAccount) {
  const [customer, subscription, history] = await Promise.all([
    stripe.customers.retrieve(account.customerId),
    stripe.subscriptions.retrieve(account.subscriptionId),
    stripe.subscriptions.list({ customer: account.customerId, status: "all", limit: 100 }),
  ]);
  const starts = [subscription, ...history.data].map((s) => s.start_date || s.created).filter((n) => n > 0);
  const firstStart = starts.length ? Math.min(...starts) : 0;
  const paid = firstStart
    ? (await stripe.charges.list({ customer: account.customerId, created: { gte: firstStart - 3600 }, limit: 100 })).data.filter(
        (c) => c.paid && c.status === "succeeded",
      )
    : [];
  const charges = paid.filter((c) => c.amount > c.amount_refunded);
  const alreadyRefundedCents = paid.reduce((sum, c) => sum + c.amount_refunded, 0);
  const facts: MoneyBackFacts = {
    subscriptionStatus: subscription.status,
    firstStartedAt: firstStart ? new Date(firstStart * 1000) : null,
    claimedAt: customer.deleted ? null : (customer.metadata?.[MONEY_BACK_MARK] ?? null),
    refundableCents: charges.reduce((sum, c) => sum + (c.amount - c.amount_refunded), 0),
  };
  const pending = customer.deleted ? false : Boolean(customer.metadata?.[MONEY_BACK_PENDING]);
  return { facts, paid, charges, pending, subscription, alreadyRefundedCents };
}

export async function readMoneyBack(stripe: MoneyBackStripe, account: MoneyBackAccount, now = new Date()): Promise<MoneyBackState> {
  return moneyBackState((await readFacts(stripe, account)).facts, now);
}

/*
  One refund per charge, recorded before it is sent. A retry always looks the
  refund up at Stripe first: the amount is recomputed from the charge, so
  replaying the old idempotency key with it would be refused, not repeated.
*/
function refundOnce(stripe: MoneyBackStripe, account: MoneyBackAccount, charge: Charge) {
  return performOnce<Refund>({
    provider: "stripe",
    operation: "money_back.refund",
    correlationKey: `money-back:${charge.id}`,
    businessId: account.businessId,
    entity: { type: "charge", id: charge.id },
    kind: "payment",
    replayWindowMs: 0,
    perform: (idempotencyKey) =>
      stripe.refunds.create(
        {
          charge: charge.id,
          amount: charge.amount - charge.amount_refunded,
          reason: "requested_by_customer",
          metadata: { kind: "money_back", orviusBusinessId: account.businessId },
        },
        { idempotencyKey },
      ),
    idOf: (r) => r.id,
    retrieve: (id) => stripe.refunds.retrieve(id),
    find: async () => (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data.find((r) => r.metadata?.kind === "money_back") ?? null,
    finalize: async () => undefined,
  });
}

export type MoneyBackClaim =
  | { ok: true; refundedCents: number; subscription: Subscription }
  | { ok: false; reason: MoneyBackReason };

/*
  Mark pending, refund, cancel, mark done. A claim that dies halfway (refunds
  sent, cancel failed) is finished by the next attempt rather than refused for
  having nothing left to refund. Each refund carries a per-charge idempotency
  key, so a double click or a retry cannot pay out twice.
*/
export async function claimMoneyBack(stripe: MoneyBackStripe, account: MoneyBackAccount, now = new Date()): Promise<MoneyBackClaim> {
  const { facts, paid, charges, pending, subscription: current, alreadyRefundedCents } = await readFacts(stripe, account);
  if (!pending) {
    const state = moneyBackState(facts, now);
    if (!state.eligible) return { ok: false, reason: state.reason };
    await stripe.customers.update(account.customerId, { metadata: { [MONEY_BACK_PENDING]: now.toISOString() } });
  } else if (facts.claimedAt) {
    return { ok: false, reason: "already_used" };
  }

  // A finished retry reports what the first attempt already sent back.
  let refundedCents = pending ? alreadyRefundedCents : 0;
  for (const charge of charges) refundedCents += (await refundOnce(stripe, account, charge)).amount;
  if (pending) {
    /* A refund whose reply was lost but which Stripe carried out leaves the charge fully refunded; land its record too. */
    const open = await prisma.providerEffect.findMany({
      where: { provider: "stripe", operation: "money_back.refund", status: { not: "finalized" }, correlationKey: { in: paid.map((c) => `money-back:${c.id}`) } },
      select: { correlationKey: true },
    });
    const openKeys = new Set(open.map((row) => row.correlationKey));
    for (const charge of paid) {
      if (charges.includes(charge) || !openKeys.has(`money-back:${charge.id}`)) continue;
      await refundOnce(stripe, account, charge).catch((error: unknown) =>
        logWarn("money_back.refund_record_unreconciled", { chargeId: charge.id, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  }
  const subscription =
    current.status === "canceled"
      ? current
      : await performOnce<Subscription>({
          provider: "stripe",
          operation: "money_back.cancel_plan",
          correlationKey: `money-back-cancel:${account.subscriptionId}`,
          businessId: account.businessId,
          entity: { type: "subscription", id: account.subscriptionId },
          kind: "cancel",
          replayWindowMs: 0,
          perform: () => stripe.subscriptions.cancel(account.subscriptionId, { invoice_now: false, prorate: false }),
          idOf: (s) => s.id,
          retrieve: (id) => stripe.subscriptions.retrieve(id),
          find: async () => {
            const sub = await stripe.subscriptions.retrieve(account.subscriptionId);
            return sub.status === "canceled" ? sub : null;
          },
          finalize: async () => undefined,
        });
  await stripe.customers.update(account.customerId, { metadata: { [MONEY_BACK_MARK]: now.toISOString(), [MONEY_BACK_PENDING]: "" } });
  return { ok: true, refundedCents, subscription };
}
