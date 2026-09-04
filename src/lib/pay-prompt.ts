/** When to show the subscribe pay-prompt loop inside the product. */

export type PayPromptTone = "trial" | "required" | "past_due";

export type PayPromptDecision = {
  show: boolean;
  tone: PayPromptTone;
  headline: string;
  body: string;
  primaryCta: string;
  /** Snooze length after dismiss (ms). Past-due snoozes shorter = tighter loop. */
  snoozeMs: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Active paid shops never see the prompt.
 * Everyone else gets a recurring pay loop (pilot soft, unpaid/canceled hard, past_due urgent).
 */
export function getPayPromptDecision(params: {
  billingStatus?: string | null;
  billingPlan?: string | null;
  shopCreatedAt?: string | Date | null;
}): PayPromptDecision | null {
  const status = (params.billingStatus ?? "none").toLowerCase();

  if (status === "active") {
    return null;
  }

  if (status === "past_due") {
    return {
      show: true,
      tone: "past_due",
      headline: "Payment failed — keep your line live",
      body: "Update billing now so missed calls keep converting into booked jobs. Your shop stays on Orvius once payment succeeds.",
      primaryCta: "Fix payment",
      snoozeMs: 1 * HOUR,
    };
  }

  if (status === "canceled") {
    return {
      show: true,
      tone: "required",
      headline: "Subscribe to keep using Orvius",
      body: "Your subscription ended. Choose a plan to keep answering calls, booking jobs, and alerting your phone.",
      primaryCta: "Subscribe to continue",
      snoozeMs: 4 * HOUR,
    };
  }

  // pilot / none / unknown — still get the pay loop (design partners included)
  const created = params.shopCreatedAt ? new Date(params.shopCreatedAt) : null;
  const ageDays =
    created && !Number.isNaN(created.getTime())
      ? Math.max(0, Math.floor((Date.now() - created.getTime()) / DAY))
      : null;

  const trialEnding = ageDays != null && ageDays >= 21;

  return {
    show: true,
    tone: trialEnding || status === "none" ? "required" : "trial",
    headline: trialEnding
      ? "Your pilot is ending — subscribe to keep the line"
      : status === "none"
        ? "Subscribe to run Orvius for your shop"
        : "Keep Orvius after the pilot",
    body: trialEnding
      ? `You're on day ${ageDays} of the design partner program. Subscribe so after-hours calls keep becoming booked jobs without interruption.`
      : status === "none"
        ? "Orvius answers, qualifies, books, and texts you the lead. Pick Line, Pro, or Fleet to unlock your dedicated shop line for good."
        : "Design partner access is temporary. Subscribe when you're ready — Line starts at $149/mo. Dismiss for now; we'll ask again.",
    primaryCta: "Choose a plan",
    snoozeMs: trialEnding || status === "none" ? 6 * HOUR : 12 * HOUR,
  };
}

export const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";
