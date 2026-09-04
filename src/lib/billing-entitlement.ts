/**
 * Billing entitlement — multi-billion rule: free ends, pay continues.
 * Active (and past_due grace) keep access. Expired pilot / canceled / none after trial → locked.
 */

export const PILOT_DAYS = 30;

export type BusinessBillingFields = {
  billingStatus?: string | null;
  billingPlan?: string | null;
  pilotEndsAt?: Date | string | null;
  createdAt?: Date | string | null;
};

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
 * - past_due: yes (urgent pay prompt; Stripe may recover)
 * - pilot / none: yes only while pilot window open
 * - canceled / expired pilot: no
 */
export function isBillingEntitled(
  business: BusinessBillingFields,
  now = new Date(),
): boolean {
  const status = (business.billingStatus ?? "none").toLowerCase();

  if (status === "active" || status === "past_due") {
    return true;
  }

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
  if (status === "canceled") return "canceled";
  if (isPilotExpired(business, now)) return "trial_ended";
  return "unpaid";
}

export function defaultPilotEndsAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + PILOT_DAYS);
  return d;
}
