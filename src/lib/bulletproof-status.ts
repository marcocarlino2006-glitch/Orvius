/**
 * Runtime bulletproof status for dashboard / pricing fail-closed UI.
 * Product never looks “fully live” when cash or counsel gates are red.
 */

import {
  getBillingReadiness,
  isAnyPlanCheckoutReady,
} from "@/lib/billing-readiness";
import { company } from "@/lib/company";

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
  /** Safe to make formation/legal claims. */
  legalReady: boolean;
  openGates: BulletproofGate[];
  gates: BulletproofGate[];
};

export function getBulletproofStatus(): BulletproofStatus {
  const billing = getBillingReadiness();
  const checkoutReady = isAnyPlanCheckoutReady();
  const formationReady = Boolean(company.formationStateConfirmed?.trim());
  const stripeKey = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const webhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

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
      ok: checkoutReady,
      detail: checkoutReady
        ? "At least one plan can checkout"
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
  const checkoutPublicReady = stripeKey && checkoutReady && webhook;
  const legalReady = formationReady;
  const fullyReady = checkoutPublicReady && legalReady;

  return {
    productReady: true,
    fullyReady,
    checkoutPublicReady,
    legalReady,
    openGates,
    gates,
  };
}
