import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { logWarn } from "@/lib/logger";
import { getPaidPlans, getStripePriceIdForPlan, type PaidPlanId } from "@/lib/pricing-plans";
import { getAppBaseUrl } from "@/lib/stripe";

/*
  Stripe refuses to open the customer portal until a portal configuration
  exists, and the default one is whatever someone last saved in the Stripe
  dashboard: maybe no plan switching, maybe cancel-immediately. Manage, Switch
  plan and Continue to cancel all depend on it, so Orvius brings its own and
  never relies on a dashboard step.

  The configuration is found again by a fingerprint of the plan prices, so a
  price change makes a new one and every redeploy reuses the same one.
*/

let cached: { key: string; id: string } | null = null;

function planPrices(): string[] {
  return getPaidPlans().flatMap((plan) =>
    (["month", "year"] as const).map((i) => getStripePriceIdForPlan(plan.id as PaidPlanId, i)).filter((p): p is string => Boolean(p)),
  );
}

export function portalFingerprint(prices: string[]): string {
  return `orvius-portal-v1:${createHash("sha256").update([...prices].sort().join(",")).digest("hex").slice(0, 16)}`;
}

/** Each product with its plan prices, the shape Stripe wants for plan switching. */
export async function portalProducts(stripe: Stripe, prices: string[]) {
  const byProduct = new Map<string, string[]>();
  for (const id of prices) {
    const price = await stripe.prices.retrieve(id);
    const product = typeof price.product === "string" ? price.product : price.product.id;
    byProduct.set(product, [...(byProduct.get(product) ?? []), id]);
  }
  return [...byProduct].map(([product, list]) => ({ product, prices: list }));
}

export function portalConfigurationParams(
  products: { product: string; prices: string[] }[],
  fingerprint: string,
): Stripe.BillingPortal.ConfigurationCreateParams {
  const base = getAppBaseUrl();
  return {
    business_profile: { privacy_policy_url: `${base}/privacy`, terms_of_service_url: `${base}/terms` },
    default_return_url: `${base}/dashboard/billing`,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "phone", "tax_id"] },
      // The terms promise access through the paid period, so cancel always waits for it.
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "unused", "missing_features", "switched_service", "too_complex", "other"],
        },
      },
      subscription_update: products.length
        ? { enabled: true, default_allowed_updates: ["price"], products, proration_behavior: "create_prorations" }
        : { enabled: false },
    },
    metadata: { orvius: fingerprint },
  };
}

/** Orvius's portal configuration id, made on first use; null leaves Stripe's default in place. */
export async function ensurePortalConfiguration(stripe: Stripe): Promise<string | null> {
  const prices = planPrices();
  const key = portalFingerprint(prices);
  if (cached?.key === key) return cached.id;
  try {
    const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const found = existing.data.find((c) => c.metadata?.orvius === key);
    const id = found
      ? found.id
      : (await stripe.billingPortal.configurations.create(portalConfigurationParams(await portalProducts(stripe, prices), key))).id;
    cached = { key, id };
    return id;
  } catch (error) {
    logWarn("billing.portal_config_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
