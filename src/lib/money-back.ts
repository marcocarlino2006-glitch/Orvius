/*
  The first-month offer: in the first MONEY_BACK_DAYS of a shop's first plan,
  the owner can cancel from Billing and every payment made so far is refunded.
  Once per Stripe customer, ever. Stripe is the record, so a claim survives a
  database restore and needs no column of its own.
*/

export const MONEY_BACK_DAYS = 30;
export const MONEY_BACK_MARK = "orvius_money_back";
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
