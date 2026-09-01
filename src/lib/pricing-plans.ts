/** Single source of truth for Orvius plans — copy, Stripe env keys, checkout. */

export type PaidPlanId = "line" | "pro" | "fleet";
export type PlanId = "pilot" | PaidPlanId;

export type PricingPlan = {
  id: PlanId;
  name: string;
  tagline: string;
  price: number;
  period: string;
  limit?: string;
  cta: string;
  href?: string;
  featured?: boolean;
  highlights: readonly string[];
  /** Stripe env var for this plan's price id */
  stripePriceEnvKey?: string;
  /** Metadata written to Stripe subscription */
  stripeProductKey?: string;
};

export const pricingPlans: readonly PricingPlan[] = [
  {
    id: "pilot",
    name: "Design partner program",
    tagline: "Free onboarding with the Orvius team",
    price: 0,
    period: "30 days",
    limit: "Limited availability",
    cta: "Apply for design partner",
    href: "/pilot",
    highlights: [
      "Dedicated local line assigned at onboarding",
      "Full AI receptionist on your shop number",
      "Lead inbox + owner SMS alerts",
      "Personal onboarding with the Orvius team",
      "No credit card required",
    ],
  },
  {
    id: "line",
    name: "Orvius Line",
    tagline: "Answer every call. Never miss a lead.",
    price: 149,
    period: "per month",
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_LINE",
    stripeProductKey: "orvius-line",
    highlights: [
      "Dedicated shop line + AI receptionist",
      "Qualified leads with urgency, service, and address",
      "Owner SMS alerts + lead inbox",
      "Business hours & services you control",
      "Email support · cancel anytime",
    ],
  },
  {
    id: "pro",
    name: "Orvius Pro",
    tagline: "Full shop workspace — front door through dispatch",
    price: 299,
    period: "per month",
    featured: true,
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_PRO",
    stripeProductKey: "orvius-pro",
    highlights: [
      "Everything in Line",
      "Customer records & call history",
      "Jobs, scheduling, and dispatch board",
      "Ask — shop intelligence on your data",
      "Priority email support · cancel anytime",
    ],
  },
  {
    id: "fleet",
    name: "Orvius Fleet",
    tagline: "For shops running 6+ trucks",
    price: 499,
    period: "per month",
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_FLEET",
    stripeProductKey: "orvius-fleet",
    highlights: [
      "Everything in Pro",
      "Multi-tech dispatch workflows",
      "Priority onboarding & support line",
      "Quarterly shop health review",
      "Cancel anytime",
    ],
  },
] as const;

/** @deprecated Use pricingPlans — kept for gradual migration */
export const pricing = {
  pilot: pricingPlans.find((p) => p.id === "pilot")!,
  line: pricingPlans.find((p) => p.id === "line")!,
  pro: pricingPlans.find((p) => p.id === "pro")!,
  fleet: pricingPlans.find((p) => p.id === "fleet")!,
} as const;

export function getPlanById(id: PlanId): PricingPlan {
  const plan = pricingPlans.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function getPaidPlans(): Array<PricingPlan & { id: PaidPlanId }> {
  return pricingPlans.filter(
    (p): p is PricingPlan & { id: PaidPlanId } => p.id !== "pilot",
  );
}

export function getFeaturedPlan(): PricingPlan {
  return pricingPlans.find((p) => p.featured) ?? getPlanById("pro");
}

export function getLowestPaidPrice(): number {
  return Math.min(...getPaidPlans().map((p) => p.price));
}

export function getStripePriceEnvKey(planId: PaidPlanId): string {
  return getPlanById(planId).stripePriceEnvKey ?? `STRIPE_PRICE_ID_${planId.toUpperCase()}`;
}

/** Legacy STRIPE_PRICE_ID maps to Pro when STRIPE_PRICE_ID_PRO is unset. */
export function getStripePriceIdForPlan(planId: PaidPlanId): string | null {
  const envKey = getStripePriceEnvKey(planId);
  const direct = process.env[envKey]?.trim();
  if (direct) return direct;

  if (planId === "pro") {
    return process.env.STRIPE_PRICE_ID?.trim() ?? null;
  }

  return null;
}

export function isPlanCheckoutReady(planId: PaidPlanId): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && getStripePriceIdForPlan(planId),
  );
}

export function getConfiguredPaidPlans(): PaidPlanId[] {
  return getPaidPlans()
    .map((p) => p.id)
    .filter((id) => isPlanCheckoutReady(id));
}

export function requireStripePriceIdForPlan(planId: PaidPlanId): string {
  const priceId = getStripePriceIdForPlan(planId);
  if (!priceId) {
    throw new Error(`${getStripePriceEnvKey(planId)} is not configured`);
  }
  return priceId;
}

export function isPaidPlanId(value: string): value is PaidPlanId {
  return value === "line" || value === "pro" || value === "fleet";
}
