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

export type BillingChecklistItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
};

export type BillingReadiness = {
  checkoutReady: boolean;
  fullyReady: boolean;
  config: BillingConfig;
  configuredPlans: PaidPlanId[];
  missing: string[];
  nextSteps: string[];
  checklist: BillingChecklistItem[];
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
  const pricesReady = configuredPlans.length === paidPlans.length;

  const checklist: BillingChecklistItem[] = [
    {
      id: "secret",
      label: "Stripe secret key",
      detail: "Paste STRIPE_SECRET_KEY from Stripe → Developers → API keys",
      ok: config.secretKey,
    },
    {
      id: "publishable",
      label: "Publishable key",
      detail: "Paste NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_…)",
      ok: config.publishableKey,
    },
    {
      id: "prices",
      label: "Plan prices",
      detail: pricesReady
        ? "Line, Pro, and Fleet monthly prices are live"
        : `Add price IDs for ${
            paidPlans
              .filter((plan) => !config.planPriceIds[plan.id])
              .map((plan) => plan.name)
              .join(", ") || "each plan"
          }`,
      ok: pricesReady,
    },
    {
      id: "webhook",
      label: "Webhook",
      detail:
        "Endpoint https://api.orvius.im/api/billing/webhook + STRIPE_WEBHOOK_SECRET",
      ok: config.webhookSecret,
    },
  ];

  if (!config.secretKey) {
    missing.push("STRIPE_SECRET_KEY");
    nextSteps.push("Add STRIPE_SECRET_KEY from Stripe → Developers → API keys");
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
      "Optional: add annual price IDs (STRIPE_PRICE_ID_*_ANNUAL) when you’re ready",
    );
  }

  if (missing.some((key) => key.startsWith("STRIPE_PRICE_ID"))) {
    nextSteps.push("Add Line, Pro, and Fleet monthly price IDs on Vercel");
  }

  if (!config.webhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
    nextSteps.push(
      "Create webhook → https://api.orvius.im/api/billing/webhook → paste STRIPE_WEBHOOK_SECRET",
    );
  }

  if (!config.publishableKey) {
    missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    nextSteps.push("Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from Stripe API keys");
  }

  const checkoutReady = config.secretKey && configuredPlans.length > 0;
  const fullyReady =
    checkoutReady &&
    config.webhookSecret &&
    configuredPlans.length === paidPlans.length;

  if (checkoutReady && !fullyReady) {
    nextSteps.unshift(
      "Checkout can run — finish the open checklist items, then redeploy",
    );
  }

  if (fullyReady) {
    nextSteps.length = 0;
    nextSteps.push("Money path is live — run one test Pay with card on Billing");
  }

  return {
    checkoutReady,
    fullyReady,
    config,
    configuredPlans,
    missing,
    nextSteps,
    checklist,
  };
}

export function isAnyPlanCheckoutReady(): boolean {
  return getPaidPlans().some((plan) => isPlanCheckoutReady(plan.id));
}
