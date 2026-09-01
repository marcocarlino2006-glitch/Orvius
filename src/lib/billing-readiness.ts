import { pricing } from "@/lib/company";

export type BillingConfig = {
  secretKey: boolean;
  priceId: boolean;
  webhookSecret: boolean;
  publishableKey: boolean;
};

export type BillingReadiness = {
  checkoutReady: boolean;
  fullyReady: boolean;
  config: BillingConfig;
  priceCents: number;
  missing: string[];
  nextSteps: string[];
};

export function getBillingConfig(): BillingConfig {
  return {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    priceId: Boolean(process.env.STRIPE_PRICE_ID?.trim()),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
  };
}

export function getBillingReadiness(): BillingReadiness {
  const config = getBillingConfig();
  const missing: string[] = [];
  const nextSteps: string[] = [];

  if (!config.secretKey) {
    missing.push("STRIPE_SECRET_KEY");
    nextSteps.push("Add STRIPE_SECRET_KEY from Stripe Dashboard → Developers → API keys");
  }

  if (!config.priceId) {
    missing.push("STRIPE_PRICE_ID");
    nextSteps.push(`Run npm run stripe:setup to create the $${pricing.pro.price}/mo Orvius Pro price`);
  }

  if (!config.webhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
    nextSteps.push(
      "Create webhook at Stripe → Developers → Webhooks → api.orvius.im/api/billing/webhook",
    );
  }

  if (!config.publishableKey) {
    missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    nextSteps.push("Add publishable key from Stripe Dashboard (optional for Checkout redirect flow)");
  }

  const checkoutReady = config.secretKey && config.priceId;
  const fullyReady = checkoutReady && config.webhookSecret;

  return {
    checkoutReady,
    fullyReady,
    config,
    priceCents: pricing.pro.price * 100,
    missing,
    nextSteps,
  };
}
