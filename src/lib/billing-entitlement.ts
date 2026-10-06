/**
 * Billing entitlement — multi-billion rule: free ends, pay continues.
 * Active (and past_due grace) keep access. Expired pilot / canceled / none after trial → locked.
 */

export const PILOT_DAYS = 30;
/** Days a shop keeps the product after a failed payment while Stripe retries the card. */
export const PAST_DUE_GRACE_DAYS = 7;

export type BusinessBillingFields = {
  billingStatus?: string | null;
  billingPlan?: string | null;
  pilotEndsAt?: Date | string | null;
  createdAt?: Date | string | null;
  pastDueSince?: Date | string | null;
};

/*
  The line is the last thing to go, after the dashboard: a shop that misses a
  payment keeps every call answered while Stripe retries for three weeks, and
  a pilot that ended keeps answering a week past the end while the owner
  decides. Past that, an AI receptionist answering for free is the business
  paying Vapi minutes for nobody.
*/
export const PAST_DUE_LINE_DAYS = 21;
export const PILOT_LINE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isLineEntitled(business: BusinessBillingFields, now = new Date()): boolean {
  const status = (business.billingStatus ?? "none").toLowerCase();
  if (status === "active") return true;
  if (status === "canceled") return false;
  if (status === "past_due") {
    if (!business.pastDueSince) return true;
    return now.getTime() - new Date(business.pastDueSince).getTime() <= PAST_DUE_LINE_DAYS * DAY_MS;
  }
  const ends = resolvePilotEndsAt(business);
  return !ends || now.getTime() <= ends.getTime() + PILOT_LINE_GRACE_DAYS * DAY_MS;
}

export function isPastDueGraceOver(business: BusinessBillingFields, now = new Date()): boolean {
  if (!business.pastDueSince) return false;
  const since = new Date(business.pastDueSince).getTime();
  return !Number.isNaN(since) && now.getTime() - since > PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export function resolvePilotEndsAt(business: BusinessBillingFields): Date | null {
  if (business.pilotEndsAt) {
    const d = new Date(business.pilotEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (business.createdAt) {
    const d = new Date(business.createdAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + PILOT_DAYS);
    return d;
  }
  return null;
}

export function isPilotExpired(business: BusinessBillingFields, now = new Date()): boolean {
  const ends = resolvePilotEndsAt(business);
  if (!ends) return false;
  return now.getTime() > ends.getTime();
}

/**
 * Entitled to run the product (APIs + dashboard).
 * - active: yes
 * - past_due: yes for PAST_DUE_GRACE_DAYS (urgent pay prompt; Stripe retries), then no.
 *   Calls are still answered and alerted either way; only the product locks.
 * - pilot / none: yes only while pilot window open
 * - canceled / expired pilot: no
 */
export function isBillingEntitled(
  business: BusinessBillingFields,
  now = new Date(),
): boolean {
  const status = (business.billingStatus ?? "none").toLowerCase();

  if (status === "active") return true;
  if (status === "past_due") return !isPastDueGraceOver(business, now);

  if (status === "canceled") {
    return false;
  }

  // pilot, none, unknown — trial window only
  if (isPilotExpired(business, now)) {
    return false;
  }

  return true;
}

export function billingLockReason(
  business: BusinessBillingFields,
  now = new Date(),
): "past_due" | "canceled" | "trial_ended" | "unpaid" | null {
  if (isBillingEntitled(business, now)) {
    const status = (business.billingStatus ?? "").toLowerCase();
    if (status === "past_due") return "past_due";
    return null;
  }
  const status = (business.billingStatus ?? "none").toLowerCase();
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (isPilotExpired(business, now)) return "trial_ended";
  return "unpaid";
}

export function defaultPilotEndsAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + PILOT_DAYS);
  return d;
}
