import {
  getConfiguredPaidPlans,
  getPaidPlans,
  getStripePriceIdForPlan,
  isPlanCheckoutReady,
  type PaidPlanId,
} from "@/lib/pricing-plans";

export type BillingConfig = {
  secretKey: boolean;
  webhookSecret: boolean;
  publishableKey: boolean;
  planPriceIds: Record<PaidPlanId, boolean>;
};

export type BillingReadiness = {
  checkoutReady: boolean;
  fullyReady: boolean;
  config: BillingConfig;
  configuredPlans: PaidPlanId[];
  missing: string[];
  nextSteps: string[];
};

export function getBillingConfig(): BillingConfig {
  const paidPlans = getPaidPlans();
  const planPriceIds = Object.fromEntries(
    paidPlans.map((plan) => [plan.id, Boolean(getStripePriceIdForPlan(plan.id))]),
  ) as Record<PaidPlanId, boolean>;

  return {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
    planPriceIds,
  };
}

export function getBillingReadiness(): BillingReadiness {
  const config = getBillingConfig();
  const missing: string[] = [];
  const nextSteps: string[] = [];
  const paidPlans = getPaidPlans();
  const configuredPlans = getConfiguredPaidPlans();

  if (!config.secretKey) {
    missing.push("STRIPE_SECRET_KEY");
    nextSteps.push("Add STRIPE_SECRET_KEY from Stripe Dashboard → Developers → API keys");
  }

  for (const plan of paidPlans) {
    if (!config.planPriceIds[plan.id]) {
      missing.push(plan.stripePriceEnvKey ?? `STRIPE_PRICE_ID_${plan.id.toUpperCase()}`);
    }
  }

  const missingAnnual = paidPlans.filter(
    (plan) => !isPlanCheckoutReady(plan.id, "year"),
  );
  if (missingAnnual.length > 0 && config.secretKey) {
    nextSteps.push(
      "Run npm run stripe:setup to create annual prices (STRIPE_PRICE_ID_*_ANNUAL)",
    );
  }

  if (missing.some((key) => key.startsWith("STRIPE_PRICE_ID"))) {
    nextSteps.push("Run npm run stripe:setup to create Line, Pro, and Fleet prices");
  }

  if (!config.webhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
    nextSteps.push(
      "Create webhook at Stripe → Developers → Webhooks → api.orvius.im/api/billing/webhook",
    );
  }

  if (!config.publishableKey) {
    missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    nextSteps.push("Add publishable key from Stripe Dashboard (optional for Checkout redirect)");
  }

  const checkoutReady = config.secretKey && configuredPlans.length > 0;
  const fullyReady =
    checkoutReady &&
    config.webhookSecret &&
    configuredPlans.length === paidPlans.length;

  return {
    checkoutReady,
    fullyReady,
    config,
    configuredPlans,
    missing,
    nextSteps,
  };
}

export function isAnyPlanCheckoutReady(): boolean {
  return getPaidPlans().some((plan) => isPlanCheckoutReady(plan.id));
}
