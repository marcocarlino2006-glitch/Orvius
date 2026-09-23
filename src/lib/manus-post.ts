import { isPlaceholderOwnerPhone } from "@/lib/placeholder-phone";

/**
 * Manus post bar — ordered founder close sequence.
 * Code cannot invent secrets; this names the single next red gate.
 */

export type ManusPostStepId =
  | "telephony"
  | "wedge_line"
  | "wedge_verify"
  | "wedge_alert"
  | "phone_cert"
  | "proof_video"
  | "stripe_key"
  | "stripe_setup"
  | "stripe_webhook"
  | "formation"
  | "bulletproof_green";

export type ManusPostStep = {
  id: ManusPostStepId;
  order: number;
  title: string;
  action: string;
  command?: string;
  founderOnly: boolean;
};

/** true = green, false = red, null/undefined = unknown (not probed yet). */
export type ManusPostStatusMap = Partial<
  Record<ManusPostStepId, boolean | null>
>;

/** Owner phones that look provisioned but are still theater. */
export { isPlaceholderOwnerPhone } from "@/lib/placeholder-phone";

export function ownerMobileConfigured(input: {
  ownerPhone?: string | null;
  shopLines?: Array<string | null | undefined>;
}): boolean {
  if (isPlaceholderOwnerPhone(input.ownerPhone)) return false;
  const owner = input.ownerPhone!.replace(/\D/g, "");
  for (const line of input.shopLines ?? []) {
    if (!line) continue;
    const shop = line.replace(/\D/g, "");
    if (shop && (shop === owner || shop.endsWith(owner) || owner.endsWith(shop))) {
      return false;
    }
  }
  return true;
}

/** Reject theater env values that look set but are not. */
export function hasRealSecret(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return Boolean(v) && !/YOUR_|changeme|placeholder/i.test(v);
}

/**
 * Ordered Manus close sequence — do not skip.
 * Live wedge steps are verified by wedge:ready / Settings; listed here for the runbook.
 */
export const MANUS_POST_STEPS: ManusPostStep[] = [
  {
    id: "telephony",
    order: 1,
    title: "Telephony secrets on prod",
    action:
      "Confirm Twilio+Vapi live on Vercel (api.orvius.im/api/health configured) — paste into local .env only if agent gates need them",
    command: "npm run prod:verify",
    founderOnly: true,
  },
  {
    id: "wedge_line",
    order: 2,
    title: "Dedicated shop line",
    action: "Provision one exclusive Orvius number on the design-partner shop",
    command: "npm run wedge:ready",
    founderOnly: true,
  },
  {
    id: "wedge_verify",
    order: 3,
    title: "Line verified end-to-end",
    action: "Place a real call → stamp lineVerifiedAt (prove before confirm)",
    command: "npm run wedge:ready",
    founderOnly: true,
  },
  {
    id: "wedge_alert",
    order: 4,
    title: "Owner alert delivered",
    action: "Send a real owner SMS alert that lands on your cell (not the shop line)",
    command: "npm run wedge:ready",
    founderOnly: true,
  },
  {
    id: "phone_cert",
    order: 5,
    title: "Founder phone cert 5/5",
    action:
      "From your cell: emergency, wants-human, estimate, hang-up, inbound SMS — stamp Settings",
    founderOnly: true,
  },
  {
    id: "proof_video",
    order: 6,
    title: "60–90s proof recording",
    action: "Record call → SMS → dashboard → confirm. Keep it for the post.",
    founderOnly: true,
  },
  {
    id: "stripe_key",
    order: 7,
    title: "Stripe secret key",
    action:
      "Confirm Stripe live on Vercel (api.orvius.im/api/billing/checkout configured) — paste local .env only for agent gates",
    command: "npm run prod:verify",
    founderOnly: true,
  },
  {
    id: "stripe_setup",
    order: 8,
    title: "Stripe price IDs",
    action:
      "Confirm plan price IDs on prod (configured:true covers Line/Pro/Fleet) — or npm run stripe:setup locally",
    command: "npm run prod:verify",
    founderOnly: true,
  },
  {
    id: "stripe_webhook",
    order: 9,
    title: "Stripe webhook",
    action:
      "Confirm webhook secret on prod (billing checkout configured includes it) — point Stripe at api.orvius.im/api/billing/webhook if still open",
    command: "npm run prod:verify",
    founderOnly: true,
  },
  {
    id: "formation",
    order: 10,
    title: "Formation state",
    action: "Counsel confirms LLC state → set formationStateConfirmed (never invent)",
    founderOnly: true,
  },
  {
    id: "bulletproof_green",
    order: 11,
    title: "Bulletproof clear",
    action: "npm run bulletproof exits 0 — then post wedge copy only",
    command: "npm run bulletproof",
    founderOnly: false,
  },
];

export const MANUS_ALLOWED_FIRST_POST = `Orvius answers after-hours and overflow on a dedicated shop line — qualifies the job, proposes a window, and texts the owner before the competitor picks up.

Forward your missed / busy / after-hours calls (or publish the Orvius number). First ten shops · thirty days free · orvius.im/pilot`;

export const MANUS_FORBIDDEN_CLAIMS = [
  "answers every call",
  "never miss",
  "guaranteed",
  "Jobber",
  "ServiceTitan",
  "card pay lands in the shop bank",
  "invented ARR",
] as const;

/** First red/unknown step — the only one to work on. */
export function resolveManusPostNext(
  status: ManusPostStatusMap,
  options: { skipUnknown?: boolean } = {},
): ManusPostStep | null {
  for (const step of MANUS_POST_STEPS) {
    const st = status[step.id];
    if (st === true) continue;
    if (st == null && options.skipUnknown) continue;
    return step;
  }
  return null;
}

/** Env-probeable Manus gates (never invent values). */
export function probeManusEnvSecrets(
  env: Record<string, string | undefined> = process.env,
  options: {
    prodTelephonyOk?: boolean;
    /** Prod /api/billing/checkout reports configured:true (fullyReady). */
    prodBillingOk?: boolean;
  } = {},
): Pick<
  ManusPostStatusMap,
  "telephony" | "stripe_key" | "stripe_setup" | "stripe_webhook"
> {
  const localTelephony =
    hasRealSecret(env.TWILIO_ACCOUNT_SID) &&
    hasRealSecret(env.TWILIO_AUTH_TOKEN) &&
    hasRealSecret(env.TWILIO_PHONE_NUMBER) &&
    hasRealSecret(env.VAPI_API_KEY);
  const localStripeKey = hasRealSecret(env.STRIPE_SECRET_KEY);
  const localStripeSetup =
    hasRealSecret(env.STRIPE_PRICE_ID_PRO) ||
    hasRealSecret(env.STRIPE_PRICE_ID_LINE) ||
    hasRealSecret(env.STRIPE_PRICE_ID);
  const localStripeWebhook = hasRealSecret(env.STRIPE_WEBHOOK_SECRET);
  const prodBilling = options.prodBillingOk === true;
  return {
    telephony: localTelephony || options.prodTelephonyOk === true,
    stripe_key: localStripeKey || prodBilling,
    stripe_setup: localStripeSetup || prodBilling,
    stripe_webhook: localStripeWebhook || prodBilling,
  };
}

/** Forbidden claim hits in candidate post copy. */
export function claimsViolateManusPost(text: string): string[] {
  const lower = text.toLowerCase();
  return MANUS_FORBIDDEN_CLAIMS.filter((claim) =>
    lower.includes(claim.toLowerCase()),
  );
}

/** Assemble a status map from env + live probes (null = unknown). */
export function buildManusPostStatus(input: {
  secrets?: ReturnType<typeof probeManusEnvSecrets>;
  wedgeLine?: boolean | null;
  wedgeVerify?: boolean | null;
  wedgeAlert?: boolean | null;
  phoneCertDone?: boolean | null;
  proofVideo?: boolean | null;
  formation?: boolean | null;
  bulletproof?: boolean | null;
}): ManusPostStatusMap {
  const secrets = input.secrets ?? probeManusEnvSecrets();
  return {
    telephony: secrets.telephony,
    wedge_line: input.wedgeLine ?? null,
    wedge_verify: input.wedgeVerify ?? null,
    wedge_alert: input.wedgeAlert ?? null,
    phone_cert: input.phoneCertDone ?? null,
    proof_video: input.proofVideo ?? null,
    stripe_key: secrets.stripe_key,
    stripe_setup: secrets.stripe_setup,
    stripe_webhook: secrets.stripe_webhook,
    formation: input.formation ?? null,
    bulletproof_green: input.bulletproof ?? null,
  };
}
