/** When to show the subscribe pay-prompt loop inside the product. */

import {
  isBillingEntitled,
  isPilotExpired,
  resolvePilotEndsAt,
  type BusinessBillingFields,
} from "@/lib/billing-entitlement";

export type PayPromptTone = "trial" | "required" | "past_due" | "locked";

export type PayPromptDecision = {
  show: boolean;
  tone: PayPromptTone;
  headline: string;
  body: string;
  primaryCta: string;
  /** Snooze length after dismiss (ms). Locked/past_due = no soft dismiss. */
  snoozeMs: number;
  /** When true, UI must not allow backdrop dismiss — pay or short snooze only. */
  hard: boolean;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Active paid: no prompt.
 * Mid-trial: soft loop (short snooze).
 * Expired / canceled: hard lock tone (BillingLockScreen handles full block).
 * Past due: urgent hard prompt.
 */
export function getPayPromptDecision(
  params: BusinessBillingFields & {
    billingStatus?: string | null;
    billingPlan?: string | null;
    shopCreatedAt?: string | Date | null;
  },
): PayPromptDecision | null {
  const status = (params.billingStatus ?? "none").toLowerCase();
  const fields: BusinessBillingFields = {
    billingStatus: params.billingStatus,
    billingPlan: params.billingPlan,
    pilotEndsAt: params.pilotEndsAt,
    createdAt: params.shopCreatedAt ?? params.createdAt,
  };

  if (status === "active") {
    return null;
  }

  if (status === "past_due") {
    return {
      show: true,
      tone: "past_due",
      headline: "Payment failed — keep your line live",
      body: "Update billing now so missed calls keep converting into booked jobs. Access stays locked until payment succeeds.",
      primaryCta: "Fix payment",
      snoozeMs: 0,
      hard: true,
    };
  }

  if (!isBillingEntitled(fields)) {
    return {
      show: true,
      tone: "locked",
      headline:
        status === "canceled"
          ? "Subscribe to reopen your shop"
          : "Pilot ended — subscribe to continue",
      body: "Orvius is locked until you choose a plan. Your line and workspace reopen after checkout.",
      primaryCta: "Subscribe to unlock",
      snoozeMs: 15 * MINUTE,
      hard: true,
    };
  }

  // Mid-trial soft loop
  const ends = resolvePilotEndsAt(fields);
  const daysLeft =
    ends != null
      ? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / (24 * HOUR)))
      : null;
  const endingSoon = daysLeft != null && daysLeft <= 7;

  return {
    show: true,
    tone: endingSoon || status === "none" ? "required" : "trial",
    headline: endingSoon
      ? `Pilot ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — subscribe`
      : status === "none"
        ? "Subscribe to run Orvius for your shop"
        : "Keep Orvius after the pilot",
    body: endingSoon
      ? "Subscribe now so after-hours calls keep becoming booked jobs without interruption."
      : "Design partner access is temporary. Line starts at $149/mo. We'll ask again soon.",
    primaryCta: "Choose a plan",
    snoozeMs: endingSoon || status === "none" ? 2 * HOUR : 4 * HOUR,
    hard: false,
  };
}

export const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";

export { isBillingEntitled, isPilotExpired, resolvePilotEndsAt };
