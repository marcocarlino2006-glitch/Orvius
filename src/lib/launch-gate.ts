import { getAuthConfigStatus } from "@/lib/auth-env";
import { getBillingReadiness } from "@/lib/billing-readiness";
import { isEmailConfigured } from "@/lib/email";
import { isConfigured } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { getPublicLaunchReadiness, type PublicLaunchRequirements } from "@/lib/public-launch-readiness";

/**
 * The founder's view of the launch gate: every check that keeps public signup
 * closed, plus whether texts from our number actually reach phones, each with
 * the exact fix. Founder-only: it names env vars and account steps.
 */

export type GateItem = {
  key: keyof PublicLaunchRequirements | "textDelivery";
  label: string;
  ready: boolean;
  /** Blocks public signup. Text delivery does not, but a filtered alert loses the shop. */
  blocksSignup: boolean;
  fix: string[];
  /** The founder can file this from /admin instead of the provider's console. */
  canSubmit?: boolean;
};

const TOLL_FREE = /^\+18(00|33|44|55|66|77|88)\d{7}$/;

export type TextDelivery = {
  number: string | null;
  tollFree: boolean;
  /** Twilio's toll-free verification status, e.g. TWILIO_APPROVED, IN_REVIEW, PENDING_REVIEW, TWILIO_REJECTED. */
  status: string | null;
  rejectionReason: string | null;
  checked: boolean;
};

/* Tests point this at a fake Twilio; production always talks to Twilio. */
function twilioBase(host: "api" | "messaging") {
  const override = process.env.TWILIO_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") return override.replace(/\/$/, "");
  return host === "api" ? "https://api.twilio.com" : "https://messaging.twilio.com";
}

export async function checkTextDelivery(): Promise<TextDelivery> {
  const number = process.env.TWILIO_PHONE_NUMBER?.trim() || null;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const tollFree = Boolean(number && TOLL_FREE.test(number));
  const base: TextDelivery = { number, tollFree, status: null, rejectionReason: null, checked: false };
  if (!number || !tollFree || !sid || !token) return base;

  const headers = { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` };
  try {
    const numbers = await fetch(
      `${twilioBase("api")}/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    const owned = (await numbers.json().catch(() => null)) as { incoming_phone_numbers?: Array<{ sid: string }> } | null;
    const numberSid = owned?.incoming_phone_numbers?.[0]?.sid;
    if (!numbers.ok) return base;
    if (!numberSid) return { ...base, checked: true, status: "NOT_IN_ACCOUNT" };
    const verifications = await fetch(`${twilioBase("messaging")}/v1/Tollfree/Verifications?TollfreePhoneNumberSid=${numberSid}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const body = (await verifications.json().catch(() => null)) as {
      verifications?: Array<{ status?: string; rejection_reason?: string | null; date_created?: string }>;
    } | null;
    if (!verifications.ok) return base;
    const latest = [...(body?.verifications ?? [])].sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)))[0];
    return { ...base, checked: true, status: latest?.status ?? null, rejectionReason: latest?.rejection_reason ?? null };
  } catch (error) {
    logWarn("launch_gate.text_delivery_check_failed", { error: error instanceof Error ? error.message : String(error) });
    return base;
  }
}

function textDeliveryItem(delivery: TextDelivery): GateItem {
  const item = (ready: boolean, fix: string[]): GateItem => ({ key: "textDelivery", label: "Texts reach phones", ready, blocksSignup: false, fix });
  if (!delivery.number) return item(false, ["Set TWILIO_PHONE_NUMBER to the number alerts are sent from."]);
  if (!delivery.tollFree) {
    return item(false, [
      `${delivery.number} is a local number. Carriers filter application texts from a local number until its brand and campaign are approved (10DLC), and Orvius has no automatic check for that, so shops' customer and technician texts on the shared sender stay held.`,
      "Use a verified toll-free number as TWILIO_PHONE_NUMBER, or rely on each shop's own approved registration.",
    ]);
  }
  if (delivery.status === "TWILIO_APPROVED") return item(true, []);
  if (!delivery.checked) {
    return item(false, ["Could not read the verification status from Twilio. Check Twilio Console → Messaging → Regulatory Compliance → Toll-Free Verifications."]);
  }
  if (delivery.status === "NOT_IN_ACCOUNT") {
    return item(false, [`${delivery.number} is not a number on this Twilio account. Set TWILIO_PHONE_NUMBER to one that is.`]);
  }
  if (delivery.status === "IN_REVIEW" || delivery.status === "PENDING_REVIEW") {
    return item(false, [`Toll-free verification for ${delivery.number} is ${delivery.status.toLowerCase().replace("_", " ")}. Nothing to do but wait; carriers may filter texts until it is approved.`]);
  }
  if (delivery.status === "TWILIO_REJECTED") {
    return {
      ...item(false, [
        `Twilio rejected the verification${delivery.rejectionReason ? `: ${delivery.rejectionReason}` : ""}.`,
        "Correct the field it names below and send it again.",
      ]),
      canSubmit: true,
    };
  }
  return {
    ...item(false, [
      `${delivery.number} is toll-free and not verified, so carriers can filter every alert and confirmation it sends.`,
      "Fill in the form below; Orvius files everything else with Twilio. It's free and usually takes a few business days.",
    ]),
    canSubmit: true,
  };
}

const missing = (names: string[]) => names.filter((name) => !isConfigured(name));

export async function getLaunchGate(options: { textDelivery?: TextDelivery } = {}) {
  const { requirements } = getPublicLaunchReadiness();
  const billing = getBillingReadiness();
  const auth = getAuthConfigStatus();
  const delivery = options.textDelivery ?? (await checkTextDelivery());

  const items: GateItem[] = [
    {
      key: "authReady",
      label: "Google sign-in",
      ready: requirements.authReady,
      blocksSignup: true,
      fix: auth.items.filter((i) => !i.optional && !i.configured).map((i) => `Add ${i.name} in Vercel.`),
    },
    {
      key: "telephonyReady",
      label: "Phone and voice accounts",
      ready: requirements.telephonyReady,
      blocksSignup: true,
      fix: missing(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "VAPI_API_KEY"]).map((n) => `Add ${n} in Vercel.`),
    },
    {
      key: "lineProvisioningReady",
      label: "New shops get their own line",
      ready: requirements.lineProvisioningReady,
      blocksSignup: true,
      fix: missing(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY"]).map((n) => `Add ${n} in Vercel.`),
    },
    {
      key: "voiceWebhookReady",
      label: "Call reports are signed",
      ready: requirements.voiceWebhookReady,
      blocksSignup: true,
      fix: ["Pick a long random VAPI_WEBHOOK_SECRET, add it in Vercel, and set the same value as the server secret in Vapi."],
    },
    {
      key: "billingReady",
      label: "Shops can pay",
      ready: requirements.billingReady,
      blocksSignup: true,
      fix: billing.missing.length
        ? [
            ...billing.missing.map((n) => `Add ${n} in Vercel.`),
            ...(billing.missing.some((n) => n.startsWith("STRIPE_PRICE_ID")) ? ["`npm run stripe:setup` creates the Line, Pro and Fleet prices and prints their IDs."] : []),
          ]
        : billing.nextSteps,
    },
    {
      key: "emailReady",
      label: "Email backup for alerts",
      ready: requirements.emailReady && isEmailConfigured(),
      blocksSignup: true,
      fix: ["Add RESEND_API_KEY in Vercel and verify orvius.im under Resend → Domains (three DNS records)."],
    },
    {
      key: "legalReady",
      label: "Legal entity state",
      ready: requirements.legalReady,
      blocksSignup: true,
      fix: ["Set ORVIUS_FORMATION_STATE to the state Solution Development LLC is organized in."],
    },
    textDeliveryItem(delivery),
    {
      key: "selfServeEnabled",
      label: "Signup switch",
      ready: requirements.selfServeEnabled,
      blocksSignup: true,
      fix: ["Last step: set ORVIUS_SELF_SERVE_SIGNUP=1 in Vercel. Signup stays closed until everything above is green anyway."],
    },
  ];
  for (const item of items) if (item.ready) item.fix = [];

  const blockers = items.filter((i) => i.blocksSignup && !i.ready);
  return {
    signupOpen: blockers.length === 0,
    ready: items.every((i) => i.ready),
    blockers: blockers.length,
    items,
    textDelivery: delivery,
  };
}

export type PortalStep = { key: GateItem["key"]; label: string; why: string };

/**
 * Opening order, fastest path to live: the slow approvals start first and
 * run in parallel, the instant switches wait until everything they depend
 * on is green, and the signup switch itself is always the last move.
 */
export const PORTAL_ORDER: PortalStep[] = [
  { key: "textDelivery", label: "File toll-free verification", why: "Slowest step — carriers take business days. File first, it approves while you do everything else." },
  { key: "emailReady", label: "Resend key + domain DNS", why: "DNS propagation runs itself once the records are in." },
  { key: "billingReady", label: "Stripe prices", why: "npm run stripe:setup prints the price IDs; paste them into Vercel." },
  { key: "authReady", label: "Google sign-in", why: "Minutes in Vercel once the OAuth client exists." },
  { key: "telephonyReady", label: "Twilio + Vapi keys", why: "Copy-paste from both consoles." },
  { key: "lineProvisioningReady", label: "Per-shop line provisioning", why: "Turns green with the Twilio/Vapi keys above." },
  { key: "voiceWebhookReady", label: "Voice webhook secret", why: "Same random value in Vercel and in Vapi." },
  { key: "legalReady", label: "Formation state", why: "One env value: the state the LLC is organized in." },
  { key: "selfServeEnabled", label: "Flip ORVIUS_SELF_SERVE_SIGNUP=1", why: "Always last. The portal opens the moment this lands with everything above green." },
];

/** The steps still standing between here and an open portal, in opening order. */
export function portalSequence(gate: { items: GateItem[] }): PortalStep[] {
  const pending = new Set(gate.items.filter((item) => !item.ready).map((item) => item.key));
  return PORTAL_ORDER.filter((step) => pending.has(step.key));
}
