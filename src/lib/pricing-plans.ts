/** Single source of truth for Orvius plans — copy, Stripe env keys, checkout. */

export type BillingInterval = "month" | "year";

export type PaidPlanId = "line" | "pro" | "fleet";
export type PlanId = "pilot" | PaidPlanId | "multi";

export type PricingPlan = {
  id: PlanId;
  name: string;
  tagline: string;
  price: number;
  /** Monthly equivalent when billed annually */
  annualPrice?: number;
  period: string;
  limit?: string;
  cta: string;
  href?: string;
  featured?: boolean;
  contactSales?: boolean;
  idealFor: string;
  highlights: readonly string[];
  stripePriceEnvKey?: string;
  stripePriceEnvKeyAnnual?: string;
  stripeProductKey?: string;
};

export const ANNUAL_DISCOUNT_LABEL = "Save ~17%";

export const pricingPlans: readonly PricingPlan[] = [
  {
    id: "pilot",
    name: "Design partner",
    tagline: "Free onboarding with the Orvius team",
    price: 0,
    period: "30 days free",
    limit: "Limited availability",
    cta: "Apply for design partner",
    href: "/pilot",
    idealFor: "Shops validating Orvius before committing",
    highlights: [
      "Dedicated local line assigned at onboarding",
      "Full AI receptionist on your shop number",
      "Lead inbox + owner SMS alerts",
      "Pro workspace during trial",
      "Personal onboarding — no credit card",
    ],
  },
  {
    id: "line",
    name: "Line",
    tagline: "Answer every call. Never miss a lead.",
    price: 149,
    annualPrice: 124,
    period: "per month",
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_LINE",
    stripePriceEnvKeyAnnual: "STRIPE_PRICE_ID_LINE_ANNUAL",
    stripeProductKey: "orvius-line",
    idealFor: "Owner-operators who need every call answered and alerted",
    highlights: [
      "Dedicated shop line + AI receptionist",
      "Qualified leads — urgency, service, address",
      "Owner SMS alerts + lead inbox",
      "Call log with transcripts",
      "Business hours & services you control",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Full shop workspace — front door through dispatch",
    price: 299,
    annualPrice: 249,
    period: "per month",
    featured: true,
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_PRO",
    stripePriceEnvKeyAnnual: "STRIPE_PRICE_ID_PRO_ANNUAL",
    stripeProductKey: "orvius-pro",
    idealFor: "Shops turning leads into jobs with 3–5 trucks",
    highlights: [
      "Everything in Line",
      "Customer records & full history",
      "Jobs, scheduling, and dispatch board",
      "Ask — shop intelligence on your data",
      "Up to 15 technicians on dispatch",
    ],
  },
  {
    id: "fleet",
    name: "Fleet",
    tagline: "For shops running 6+ trucks",
    price: 499,
    annualPrice: 429,
    period: "per month",
    cta: "Subscribe",
    stripePriceEnvKey: "STRIPE_PRICE_ID_FLEET",
    stripePriceEnvKeyAnnual: "STRIPE_PRICE_ID_FLEET_ANNUAL",
    stripeProductKey: "orvius-fleet",
    idealFor: "Fleet shops with daily dispatch load and multiple crews",
    highlights: [
      "Everything in Pro",
      "Unlimited technicians on dispatch",
      "Priority onboarding & support line",
      "Quarterly shop health review",
      "Multi-truck dispatch workflows",
    ],
  },
  {
    id: "multi",
    name: "Multi-shop",
    tagline: "2+ locations or franchise groups",
    price: 0,
    period: "Custom",
    cta: "Contact us",
    href: "mailto:hello@orvius.im?subject=Orvius%20Multi-shop",
    contactSales: true,
    idealFor: "Owners running multiple brands or locations",
    highlights: [
      "Dedicated lines per location",
      "Central billing & admin",
      "Custom onboarding playbook",
      "Priority support & quarterly reviews",
      "Volume pricing on 3+ shops",
    ],
  },
] as const;

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
    (p): p is PricingPlan & { id: PaidPlanId } =>
      p.id === "line" || p.id === "pro" || p.id === "fleet",
  );
}

export function getSelfServePlans(): readonly PricingPlan[] {
  return pricingPlans.filter((p) => p.id !== "multi");
}

export function getFeaturedPlan(): PricingPlan {
  return pricingPlans.find((p) => p.featured) ?? getPlanById("pro");
}

export function getLowestPaidPrice(interval: BillingInterval = "month"): number {
  return Math.min(
    ...getPaidPlans().map((p) => getPlanPrice(p, interval)),
  );
}

export function getPlanPrice(
  plan: PricingPlan,
  interval: BillingInterval,
): number {
  if (plan.contactSales || plan.id === "pilot") return plan.price;
  if (interval === "year" && plan.annualPrice != null) {
    return plan.annualPrice;
  }
  return plan.price;
}

export function getStripePriceEnvKey(
  planId: PaidPlanId,
  interval: BillingInterval = "month",
): string {
  const plan = getPlanById(planId);
  if (interval === "year" && plan.stripePriceEnvKeyAnnual) {
    return plan.stripePriceEnvKeyAnnual;
  }
  return plan.stripePriceEnvKey ?? `STRIPE_PRICE_ID_${planId.toUpperCase()}`;
}

export function getStripePriceIdForPlan(
  planId: PaidPlanId,
  interval: BillingInterval = "month",
): string | null {
  const envKey = getStripePriceEnvKey(planId, interval);
  const direct = process.env[envKey]?.trim();
  if (direct) return direct;

  if (interval === "month" && planId === "pro") {
    return process.env.STRIPE_PRICE_ID?.trim() ?? null;
  }

  if (interval === "year") {
    return null;
  }

  return null;
}

export function isPlanCheckoutReady(
  planId: PaidPlanId,
  interval: BillingInterval = "month",
): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      getStripePriceIdForPlan(planId, interval),
  );
}

export function getConfiguredPaidPlans(
  interval: BillingInterval = "month",
): PaidPlanId[] {
  return getPaidPlans()
    .map((p) => p.id)
    .filter((id) => isPlanCheckoutReady(id, interval));
}

export function requireStripePriceIdForPlan(
  planId: PaidPlanId,
  interval: BillingInterval = "month",
): string {
  const priceId = getStripePriceIdForPlan(planId, interval);
  if (!priceId) {
    throw new Error(`${getStripePriceEnvKey(planId, interval)} is not configured`);
  }
  return priceId;
}

export function isPaidPlanId(value: string): value is PaidPlanId {
  return value === "line" || value === "pro" || value === "fleet";
}
