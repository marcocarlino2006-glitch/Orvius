import type { PaidPlanId, PlanId } from "@/lib/pricing-plans";
import {
  isBillingEntitled,
  type BusinessBillingFields,
} from "@/lib/billing-entitlement";

/** Dashboard modules that can be gated by plan. */
export type PlanModule =
  | "today"
  | "inbox"
  | "calls"
  | "customers"
  | "jobs"
  | "dispatch"
  | "ask";

export type PlanFeatureSet = {
  modules: readonly PlanModule[];
  maxTechnicians: number | null;
  /*
    There is no `prioritySupport` here on purpose.

    It used to sit in this type, set true for Fleet, and be read by nothing —
    so the pricing page could sell a support tier and point at a flag as
    evidence it existed. Support is one inbox answered by one person, the same
    for every plan, and the published standard in institutional-standards.ts
    says so. A plan tier gates capability; if it ever gates support, that has
    to be something the product can actually do differently.
  */
};

const LINE_MODULES: PlanModule[] = ["today", "inbox", "calls"];
const PRO_MODULES: PlanModule[] = [
  "today",
  "inbox",
  "calls",
  "customers",
  "jobs",
  "dispatch",
  "ask",
];

export const planFeatures: Record<PaidPlanId, PlanFeatureSet> = {
  line: {
    modules: LINE_MODULES,
    maxTechnicians: 0,
  },
  pro: {
    modules: PRO_MODULES,
    maxTechnicians: 15,
  },
  fleet: {
    modules: PRO_MODULES,
    maxTechnicians: null,
  },
};

const EXPIRED_FEATURES: PlanFeatureSet = {
  modules: [],
  maxTechnicians: 0,
};

/**
 * Effective plan for feature gates.
 * Expired / canceled unpaid → "expired" (no modules).
 * Pilot within window → Pro modules (temporary).
 */
export function getEffectivePlanId(
  params: BusinessBillingFields,
): PaidPlanId | "pilot" | "expired" {
  if (!isBillingEntitled(params)) {
    return "expired";
  }

  const { billingStatus, billingPlan } = params;

  if (billingStatus === "pilot" || billingStatus === "none" || !billingStatus) {
    return "pilot";
  }

  if (
    billingStatus === "active" &&
    billingPlan &&
    billingPlan in planFeatures
  ) {
    return billingPlan as PaidPlanId;
  }

  if (billingStatus === "past_due" && billingPlan && billingPlan in planFeatures) {
    return billingPlan as PaidPlanId;
  }

  return "pilot";
}

export function getFeatureSetForPlan(
  plan: PaidPlanId | "pilot" | "expired",
): PlanFeatureSet {
  if (plan === "expired") return EXPIRED_FEATURES;
  if (plan === "pilot") return planFeatures.pro;
  return planFeatures[plan];
}

export function canAccessModule(
  plan: PaidPlanId | "pilot" | "expired",
  module: PlanModule,
): boolean {
  return getFeatureSetForPlan(plan).modules.includes(module);
}

export function minimumPlanForModule(module: PlanModule): PaidPlanId {
  if (LINE_MODULES.includes(module)) return "line";
  return "pro";
}

export function moduleLabel(module: PlanModule): string {
  switch (module) {
    case "today":
      return "Today";
    case "inbox":
      return "Inbox";
    case "calls":
      return "Calls";
    case "customers":
      return "Customers";
    case "jobs":
      return "Jobs";
    case "dispatch":
      return "Dispatch";
    case "ask":
      return "Copilot";
  }
}

export function navHrefToModule(href: string): PlanModule | null {
  if (href === "/dashboard") return "today";
  if (href.startsWith("/dashboard/inbox")) return "inbox";
  if (href.startsWith("/dashboard/calls")) return "calls";
  if (href.startsWith("/dashboard/customers")) return "customers";
  if (href.startsWith("/dashboard/jobs")) return "jobs";
  if (href.startsWith("/dashboard/dispatch")) return "dispatch";
  if (href.startsWith("/dashboard/ask")) return "ask";
  return null;
}

export type { PlanId };
