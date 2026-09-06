import { randomBytes } from "node:crypto";

/**
 * Sales go-live checklist — what must be true before promising a pilot.
 * Product + ops gates. No invented traction.
 */
export type GoLiveCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  href?: string;
};

export type GoLiveReport = {
  ready: boolean;
  criticalOpen: number;
  checks: GoLiveCheck[];
};

export function buildGoLiveReport(input: {
  hasDedicatedLine: boolean;
  lineVerified: boolean;
  overflowForwardConfirmed: boolean;
  ownerPhoneOk: boolean;
  smsConfigured: boolean;
  emailConfigured: boolean;
  stripeLive: boolean;
  stripePrices: boolean;
  googleAuth: boolean;
  baselineSet: boolean;
  founderCertComplete: boolean;
}): GoLiveReport {
  const checks: GoLiveCheck[] = [
    {
      id: "dedicated_line",
      label: "Dedicated shop line provisioned",
      ok: input.hasDedicatedLine,
      detail: input.hasDedicatedLine
        ? "Inbound line is mapped to this shop."
        : "Provision the shop line before selling capture.",
      href: "/dashboard/settings",
    },
    {
      id: "line_verified",
      label: "Line answered a real call",
      ok: input.lineVerified,
      detail: input.lineVerified
        ? "At least one completed inbound call hit this line."
        : "Place a live test call and complete founder phone cert.",
      href: "/dashboard/settings#founder-cert",
    },
    {
      id: "overflow_forward",
      label: "Missed/busy/after-hours forward confirmed",
      ok: input.overflowForwardConfirmed,
      detail: input.overflowForwardConfirmed
        ? "Owner confirmed carrier forward / after-hours routing to Orvius."
        : "Without forward, you only catch calls to the Orvius number — say that on the sale.",
      href: "/dashboard/settings#overflow-forward",
    },
    {
      id: "owner_phone",
      label: "Owner mobile for alerts",
      ok: input.ownerPhoneOk,
      detail: input.ownerPhoneOk
        ? "Owner alerts have a destination."
        : "Add owner mobile or alerts never leave the queue.",
      href: "/dashboard/settings",
    },
    {
      id: "sms",
      label: "Twilio SMS ready",
      ok: input.smsConfigured,
      detail: input.smsConfigured
        ? "Owner + customer SMS paths can send."
        : "Set TWILIO_* env before promising SMS alerts or confirm links.",
    },
    {
      id: "email",
      label: "Email failover ready",
      ok: input.emailConfigured,
      detail: input.emailConfigured
        ? "RESEND configured for SMS→email failover."
        : "Optional but recommended: set RESEND_API_KEY before volume pilots.",
    },
    {
      id: "stripe",
      label: "Stripe live keys",
      ok: input.stripeLive,
      detail: input.stripeLive
        ? "STRIPE_SECRET_KEY present."
        : "Checkout returns 503 until Stripe keys are live.",
      href: "/dashboard/billing",
    },
    {
      id: "stripe_prices",
      label: "Stripe price IDs for plans",
      ok: input.stripePrices,
      detail: input.stripePrices
        ? "Line/Pro price IDs configured."
        : "Add STRIPE_PRICE_ID_* before taking paid conversions.",
      href: "/dashboard/billing",
    },
    {
      id: "google_auth",
      label: "Google sign-in configured",
      ok: input.googleAuth,
      detail: input.googleAuth
        ? "OAuth client configured."
        : "Self-serve login needs GOOGLE_CLIENT_ID/SECRET in production.",
    },
    {
      id: "baseline",
      label: "Economics baseline set",
      ok: input.baselineSet,
      detail: input.baselineSet
        ? "Avg ticket + before-Orvius weekly numbers saved."
        : "Set baseline so weekly proof isn't empty theater.",
      href: "/dashboard/settings#economics-baseline",
    },
    {
      id: "founder_cert",
      label: "Founder phone cert 5/5",
      ok: input.founderCertComplete,
      detail: input.founderCertComplete
        ? "Five live-cell scenarios stamped."
        : "Finish cert before high-volume outreach claims.",
      href: "/dashboard/settings#founder-cert",
    },
  ];

  const criticalIds = new Set([
    "dedicated_line",
    "owner_phone",
    "sms",
    "stripe",
    "stripe_prices",
  ]);
  const criticalOpen = checks.filter((c) => criticalIds.has(c.id) && !c.ok).length;

  return {
    ready: criticalOpen === 0,
    criticalOpen,
    checks,
  };
}

export function newPublicToken(): string {
  return randomBytes(18).toString("base64url");
}
