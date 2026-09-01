import Stripe from "stripe";
import { getStripeAppBaseUrl } from "@/lib/stripe-url";
import {
  getBillingConfig,
  getBillingReadiness,
  type BillingReadiness,
} from "@/lib/billing-readiness";

export { getBillingConfig, getBillingReadiness, type BillingReadiness };

let stripeClient: Stripe | null = null;

/** Checkout can start — secret key + price id present. */
export function isStripeCheckoutConfigured() {
  return getBillingReadiness().checkoutReady;
}

/** Subscriptions sync after payment — includes webhook secret. */
export function isStripeConfigured() {
  return getBillingReadiness().fullyReady;
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

export function getStripePriceId() {
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID is not configured");
  }
  return priceId;
}
