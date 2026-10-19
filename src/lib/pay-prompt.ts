/** When to show the subscribe pay-prompt loop inside the product. */

import {
  isBillingEntitled,
  PAST_DUE_GRACE_DAYS,
  PAST_DUE_LINE_DAYS,
  isPilotExpired,
  resolvePilotEndsAt,
  type BusinessBillingFields,
} from "@/lib/billing-entitlement";
import { pricing } from "@/lib/pricing-plans";

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
 * Expired / canceled: hard lock tone (Command shows the lock bar).
 * Past due: urgent hard prompt.
 */
export function getPayPromptDecision(
  params: BusinessBillingFields & {
    billingStatus?: string | null;
    billingPlan?: string | null;
    shopCreatedAt?: string | Date | null;
  },
): PayPromptDecision | null {
  if (params.environment === "demo") return null;
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
      body: `Your line keeps answering for now. Update your card within ${PAST_DUE_GRACE_DAYS} days of the failed payment or the workspace locks, and after ${PAST_DUE_LINE_DAYS} days the line stops answering until it succeeds.`,
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
          ? "Pay to reopen your shop"
          : "Access ended — pay to continue",
      body: "Orvius is locked until you pay. One tap opens Stripe Checkout for Pro — your line and workspace reopen after.",
      primaryCta: "Pay with card",
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
      ? `Access ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — pay to keep the line`
      : status === "none"
        ? "Pay to run Orvius for your shop"
        : "Keep Orvius for your shop",
    body: endingSoon
      ? `Pay with card now so after-hours calls keep becoming qualified jobs without interruption. Pro is $${pricing.pro.price}/mo — cancel anytime.`
      : `Shop access is temporary. Pro is $${pricing.pro.price}/mo — one tap opens Stripe Checkout. We’ll ask again soon.`,
    primaryCta: "Pay with card",
    snoozeMs: endingSoon || status === "none" ? 2 * HOUR : 4 * HOUR,
    hard: false,
  };
}

export const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";
export const PAY_PROMPT_FIRST_SEEN_KEY = "orvius-pay-prompt-first-seen";

/** A soft trial ask waits until the owner has had a day with the product. */
export const PAY_PROMPT_VALUE_DELAY_MS = 24 * HOUR;

/**
 * Whether the soft modal may open right now. Value first: on the owner's
 * first day the product proves itself (calls, bookings, the Command brief)
 * before any payment ask appears. Access-ending, locked and past-due
 * states keep their urgency and are never deferred by this gate.
 */
export function payPromptOpensNow(
  decision: PayPromptDecision | null,
  firstSeenAtMs: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (!decision?.show || decision.hard) return false;
  if (decision.tone !== "trial") return true;
  if (firstSeenAtMs == null) return false;
  return nowMs - firstSeenAtMs >= PAY_PROMPT_VALUE_DELAY_MS;
}

export { isBillingEntitled, isPilotExpired, resolvePilotEndsAt };
