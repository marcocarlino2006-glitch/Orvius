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

/** All paid plans + webhook configured — safe to show Subscribe everywhere. */
export function isStripeConfigured() {
  return getBillingReadiness().fullyReady;
}

export function isStripePlanConfigured(planId: PaidPlanId) {
  return isPlanCheckoutReady(planId) && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
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
