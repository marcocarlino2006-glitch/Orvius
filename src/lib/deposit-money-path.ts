/**
 * P14 — shop wants deposits but Connect cannot take cards.
 */

import { getConnectStatus } from "@/lib/stripe-connect";

export function depositMoneyPathBroken(business: {
  depositEnabled?: boolean | null;
  stripeConnectAccountId?: string | null;
  stripeConnectChargesEnabled?: boolean | null;
  stripeConnectPayoutsEnabled?: boolean | null;
  stripeConnectDetailsSubmitted?: boolean | null;
}): boolean {
  if (!business.depositEnabled) return false;
  return !getConnectStatus(business).canAcceptPayments;
}
