/*
  The first-month offer: in the first MONEY_BACK_DAYS of a shop's first plan,
  the owner can cancel from Billing and every payment made so far is refunded.
  Once per Stripe customer, ever. Stripe is the record, so a claim survives a
  database restore and needs no column of its own.
*/

export const MONEY_BACK_DAYS = 30;
export const MONEY_BACK_MARK = "orvius_money_back";
const MONEY_BACK_PENDING = "orvius_money_back_pending";
const DAY_MS = 24 * 60 * 60 * 1000;

export type MoneyBackReason = "no_plan" | "window_closed" | "already_used" | "nothing_paid";

export type MoneyBackState =
  | { eligible: true; endsAt: Date; refundCents: number }
  | { eligible: false; reason: MoneyBackReason; endsAt: Date | null };

export type MoneyBackFacts = {
  subscriptionStatus: string | null;
  /** Start of the customer's earliest subscription: the window is for the first plan only. */
  firstStartedAt: Date | null;
  claimedAt: string | null;
  refundableCents: number;
};

export function moneyBackEndsAt(firstStartedAt: Date): Date {
  return new Date(firstStartedAt.getTime() + MONEY_BACK_DAYS * DAY_MS);
}

export function moneyBackState(facts: MoneyBackFacts, now = new Date()): MoneyBackState {
  const endsAt = facts.firstStartedAt ? moneyBackEndsAt(facts.firstStartedAt) : null;
  if (facts.claimedAt) return { eligible: false, reason: "already_used", endsAt };
  const live = facts.subscriptionStatus === "active" || facts.subscriptionStatus === "past_due" || facts.subscriptionStatus === "trialing";
  if (!live || !endsAt) return { eligible: false, reason: "no_plan", endsAt };
  if (now.getTime() > endsAt.getTime()) return { eligible: false, reason: "window_closed", endsAt };
  if (facts.refundableCents <= 0) return { eligible: false, reason: "nothing_paid", endsAt };
  return { eligible: true, endsAt, refundCents: facts.refundableCents };
}

export function moneyBackRefusal(reason: MoneyBackReason): string {
  switch (reason) {
    case "already_used":
      return "This shop has already used its first-month refund. Cancel from Manage instead.";
    case "window_closed":
      return `The first-month refund is for the first ${MONEY_BACK_DAYS} days of your first plan, and that has passed. Cancel from Manage instead.`;
    case "nothing_paid":
      return "Nothing has been charged yet, so there is nothing to refund. Cancel from Manage instead.";
    default:
      return "There's no active plan to refund.";
  }
}

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
    ): Promise<{ amount: number }>;
  };
};

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
  return { facts, charges, pending, subscription, alreadyRefundedCents };
}

export async function readMoneyBack(stripe: MoneyBackStripe, account: MoneyBackAccount, now = new Date()): Promise<MoneyBackState> {
  return moneyBackState((await readFacts(stripe, account)).facts, now);
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
  const { facts, charges, pending, subscription: current, alreadyRefundedCents } = await readFacts(stripe, account);
  if (!pending) {
    const state = moneyBackState(facts, now);
    if (!state.eligible) return { ok: false, reason: state.reason };
    await stripe.customers.update(account.customerId, { metadata: { [MONEY_BACK_PENDING]: now.toISOString() } });
  } else if (facts.claimedAt) {
    return { ok: false, reason: "already_used" };
  }

  // A finished retry reports what the first attempt already sent back.
  let refundedCents = pending ? alreadyRefundedCents : 0;
  for (const charge of charges) {
    const refund = await stripe.refunds.create(
      {
        charge: charge.id,
        amount: charge.amount - charge.amount_refunded,
        reason: "requested_by_customer",
        metadata: { kind: "money_back", orviusBusinessId: account.businessId },
      },
      { idempotencyKey: `money-back:${charge.id}` },
    );
    refundedCents += refund.amount;
  }
  const subscription =
    current.status === "canceled"
      ? current
      : await stripe.subscriptions.cancel(account.subscriptionId, { invoice_now: false, prorate: false });
  await stripe.customers.update(account.customerId, { metadata: { [MONEY_BACK_MARK]: now.toISOString(), [MONEY_BACK_PENDING]: "" } });
  return { ok: true, refundedCents, subscription };
}
