import { NextResponse } from "next/server";
import {
  canAccessModule,
  getEffectivePlanId,
  getFeatureSetForPlan,
  minimumPlanForModule,
  moduleLabel,
  type PlanModule,
} from "@/lib/plan-features";
import type { PaidPlanId } from "@/lib/pricing-plans";

type BusinessPlanFields = {
  billingStatus?: string | null;
  billingPlan?: string | null;
};

export function planUpgradeResponse(module: PlanModule) {
  const required = minimumPlanForModule(module);
  return NextResponse.json(
    {
      error: `${moduleLabel(module)} requires ${required === "pro" ? "Pro" : "Line"} or higher.`,
      upgrade: required,
      module,
    },
    { status: 402 },
  );
}

/** Gate an API route to a plan module. Pilot shops get Pro access. */
export function requirePlanModule(
  business: BusinessPlanFields,
  module: PlanModule,
): { plan: PaidPlanId | "pilot" } | { error: NextResponse } {
  const plan = getEffectivePlanId(business);
  if (!canAccessModule(plan, module)) {
    return { error: planUpgradeResponse(module) };
  }
  return { plan };
}

export function getPlanTechLimit(business: BusinessPlanFields): number | null {
  const plan = getEffectivePlanId(business);
  return getFeatureSetForPlan(plan).maxTechnicians;
}
