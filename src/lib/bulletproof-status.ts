/**
 * Runtime bulletproof status for dashboard / pricing fail-closed UI.
 * Product never looks “fully live” when cash or counsel gates are red.
 */

import { getAuthConfigStatus } from "@/lib/auth-env";
import { getBillingReadiness } from "@/lib/billing-readiness";
import { company } from "@/lib/company";
import { isEmailConfigured } from "@/lib/email";
import { getConfigStatus, isConfigured } from "@/lib/env";
import { isSelfServeSignupEnabled } from "@/lib/self-serve-signup";
import { canProvisionDedicatedLine } from "@/lib/twilio-phone";

export type BulletproofGate = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  founderOnly?: boolean;
};

export type BulletproofStatus = {
  /** Product wedge is solid (enforced by npm run bulletproof in CI). */
  productReady: boolean;
  /** Full Manus bar including Stripe + formation. */
  fullyReady: boolean;
  /** Safe to claim self-serve paid checkout publicly. */
  checkoutPublicReady: boolean;
  /** Safe for a stranger to sign up, provision, pay, and receive support mail. */
  publicSelfServeReady: boolean;
  /** Safe to make formation/legal claims. */
  legalReady: boolean;
  openGates: BulletproofGate[];
  gates: BulletproofGate[];
};

export type PublicLaunchRequirements = {
  selfServeEnabled: boolean;
  authReady: boolean;
  billingReady: boolean;
  telephonyReady: boolean;
  lineProvisioningReady: boolean;
  voiceWebhookReady: boolean;
  emailReady: boolean;
  legalReady: boolean;
};

export function arePublicLaunchRequirementsMet(
  requirements: PublicLaunchRequirements,
) {
  return Object.values(requirements).every(Boolean);
}

export function getBulletproofStatus(): BulletproofStatus {
  const billing = getBillingReadiness();
  const auth = getAuthConfigStatus();
  const telephony = getConfigStatus();
  const selfServeEnabled = isSelfServeSignupEnabled();
  const lineProvisioningReady = canProvisionDedicatedLine();
  const vapiWebhookReady = isConfigured("VAPI_WEBHOOK_SECRET");
  const emailReady = isEmailConfigured();
  const formationReady = Boolean(company.formationStateConfirmed?.trim());
  const stripeKey = billing.config.secretKey;
  const webhook = billing.config.webhookSecret;

  const gates: BulletproofGate[] = [
    {
      id: "stripe_key",
      label: "Stripe secret key",
      ok: stripeKey,
      detail: stripeKey
        ? "STRIPE_SECRET_KEY present"
        : "Paste STRIPE_SECRET_KEY — checkout stays locked",
      founderOnly: true,
    },
    {
      id: "stripe_prices",
      label: "Stripe price IDs",
      ok: billing.fullyReady,
      detail: billing.fullyReady
        ? "Every paid plan can checkout"
        : "Run npm run stripe:setup after key is set",
      founderOnly: true,
    },
    {
      id: "stripe_webhook",
      label: "Stripe webhook secret",
      ok: webhook,
      detail: webhook
        ? "STRIPE_WEBHOOK_SECRET present"
        : "Add webhook at api.orvius.im/api/billing/webhook",
      founderOnly: true,
    },
    {
      id: "self_serve_signup",
      label: "Public signup switch",
      ok: selfServeEnabled,
      detail: selfServeEnabled
        ? "New owners may enter onboarding"
        : "Set ORVIUS_SELF_SERVE_SIGNUP=1 only after every launch gate is green",
      founderOnly: true,
    },
    {
      id: "auth",
      label: "Production authentication",
      ok: auth.ready,
      detail: auth.ready
        ? "Google authentication configured"
        : "AUTH_SECRET and Google OAuth credentials are required",
      founderOnly: true,
    },
    {
      id: "telephony",
      label: "Telephony stack",
      ok: telephony.ready && lineProvisioningReady,
      detail:
        telephony.ready && lineProvisioningReady
          ? "Twilio and Vapi can provision and answer"
          : "Twilio and Vapi must be complete before public onboarding",
      founderOnly: true,
    },
    {
      id: "vapi_webhook",
      label: "Voice webhook authentication",
      ok: vapiWebhookReady,
      detail: vapiWebhookReady
        ? "VAPI_WEBHOOK_SECRET present"
        : "Set VAPI_WEBHOOK_SECRET before accepting public calls",
      founderOnly: true,
    },
    {
      id: "transactional_email",
      label: "Transactional email",
      ok: emailReady,
      detail: emailReady
        ? "Email sign-in and failover delivery configured"
        : "Set RESEND_API_KEY for sign-in links and alert failover",
      founderOnly: true,
    },
    {
      id: "formation",
      label: "LLC formation state",
      ok: formationReady,
      detail: formationReady
        ? `Confirmed: ${company.formationStateConfirmed}`
        : "Counsel-confirm formation state — never invent",
      founderOnly: true,
    },
    {
      id: "billing_full",
      label: "Billing fully ready",
      ok: billing.fullyReady,
      detail: billing.fullyReady
        ? "Checkout + webhook + prices"
        : billing.missing.length
          ? `Missing: ${billing.missing.slice(0, 4).join(", ")}`
          : "Billing not fully ready",
      founderOnly: true,
    },
  ];

  const openGates = gates.filter((g) => !g.ok);
  const checkoutPublicReady = billing.fullyReady;
  const legalReady = formationReady;
  const publicSelfServeReady = arePublicLaunchRequirementsMet({
    selfServeEnabled,
    authReady: auth.ready,
    billingReady: checkoutPublicReady,
    telephonyReady: telephony.ready,
    lineProvisioningReady,
    voiceWebhookReady: vapiWebhookReady,
    emailReady,
    legalReady,
  });
  const fullyReady = publicSelfServeReady;

  return {
    productReady: true,
    fullyReady,
    checkoutPublicReady,
    publicSelfServeReady,
    legalReady,
    openGates,
    gates,
  };
}
