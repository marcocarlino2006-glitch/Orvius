import type { PaidPlanId, PlanId } from "@/lib/pricing-plans";

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
  prioritySupport: boolean;
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
    maxTechnicians: 3,
    prioritySupport: false,
  },
  pro: {
    modules: PRO_MODULES,
    maxTechnicians: 15,
    prioritySupport: false,
  },
  fleet: {
    modules: PRO_MODULES,
    maxTechnicians: null,
    prioritySupport: true,
  },
};

/** Pilot and unpaid shops get Pro access during onboarding / trial. */
export function getEffectivePlanId(params: {
  billingStatus?: string | null;
  billingPlan?: string | null;
}): PaidPlanId | "pilot" {
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

export function getFeatureSetForPlan(plan: PaidPlanId | "pilot"): PlanFeatureSet {
  if (plan === "pilot") {
    return planFeatures.pro;
  }
  return planFeatures[plan];
}

export function canAccessModule(
  plan: PaidPlanId | "pilot",
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
      return "Ask";
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
