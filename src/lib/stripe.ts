import Stripe from "stripe";
import { getStripeAppBaseUrl } from "@/lib/stripe-url";
import {
  getBillingConfig,
  getBillingReadiness,
  isAnyPlanCheckoutReady,
  type BillingReadiness,
} from "@/lib/billing-readiness";
import {
  isPlanCheckoutReady,
  requireStripePriceIdForPlan,
  type PaidPlanId,
} from "@/lib/pricing-plans";

export { getBillingConfig, getBillingReadiness, type BillingReadiness };

let stripeClient: Stripe | null = null;

/** At least one plan can start checkout — secret key + that plan's price id. */
export function isStripeCheckoutConfigured() {
  return isAnyPlanCheckoutReady();
}

/** Secret key + webhook + all plan price ids — production-ready billing. */
export function isStripeConfigured() {
  return getBillingReadiness().fullyReady;
}

/** Per-plan checkout — secret key + price id for this plan. */
export function isStripePlanConfigured(planId: PaidPlanId) {
  return isPlanCheckoutReady(planId);
}

/*
  Local override so the money rail can be exercised against stripe-mock, which
  validates requests against Stripe's own OpenAPI spec. Without it the only way
  to prove a Connect direct charge is shaped correctly is to have live keys,
  which means the take rate ships untested.

  Refused outright in production, and only honoured for a test-mode key, so a
  misplaced env var cannot quietly point real charges at another host.
*/
function resolveApiHost() {
  const base = process.env.STRIPE_API_BASE?.trim();
  if (!base) return null;
  if (process.env.NODE_ENV === "production") return null;
  if (!process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_test")) return null;

  try {
    const url = new URL(base);
    return {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      protocol: url.protocol === "https:" ? ("https" as const) : ("http" as const),
    };
  } catch {
    return null;
  }
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    const override = resolveApiHost();
    stripeClient = new Stripe(secretKey, override ?? undefined);
  }

  return stripeClient;
}

export function getAppBaseUrl() {
  return getStripeAppBaseUrl();
}

/** @deprecated Use requireStripePriceIdForPlan(planId) */
export function getStripePriceId(planId: PaidPlanId = "pro") {
  return requireStripePriceIdForPlan(planId);
}

export { requireStripePriceIdForPlan };

/*
  Orvius's own sales (the plan and its overage) collect US sales tax through
  Stripe Tax once it is switched on and the registrations exist in the Stripe
  dashboard; SaaS is taxable in a growing list of states. Off until then,
  because enabling it with no registrations fails every checkout. Payments a
  shop takes from its own customers run on the shop's connected account and
  are the shop's to tax.
*/
export function isAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX?.trim() === "1";
}

/** Checkout fields for a plan purchase: a taxable address and tax ID when tax is on, the light form otherwise. */
export function checkoutTaxParams(existingCustomer: boolean) {
  if (!isAutomaticTaxEnabled()) return { billing_address_collection: "auto" as const };
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: "required" as const,
    tax_id_collection: { enabled: true },
    ...(existingCustomer ? { customer_update: { address: "auto" as const, name: "auto" as const } } : {}),
  };
}
