import { NextResponse } from "next/server";
import {
  billingLockReason,
  isBillingEntitled,
  type BusinessBillingFields,
} from "@/lib/billing-entitlement";
import {
  canAccessModule,
  getEffectivePlanId,
  getFeatureSetForPlan,
  minimumPlanForModule,
  moduleLabel,
  type PlanModule,
} from "@/lib/plan-features";
import type { PaidPlanId } from "@/lib/pricing-plans";

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

export function billingRequiredResponse(business: BusinessBillingFields) {
  const reason = billingLockReason(business) ?? "unpaid";
  return NextResponse.json(
    {
      error:
        reason === "trial_ended"
          ? "Your pilot ended. Subscribe to keep using Orvius."
          : reason === "canceled"
            ? "Subscription canceled. Subscribe to reopen your shop."
            : reason === "past_due"
              ? "Payment failed. Update billing to continue."
              : "Subscribe to use Orvius.",
      code: "billing_required",
      reason,
      upgrade: "pro",
    },
    { status: 402 },
  );
}

/** Hard gate: expired / canceled shops cannot use product APIs. */
export function requireActiveBilling(
  business: BusinessBillingFields,
): { ok: true } | { error: NextResponse } {
  if (!isBillingEntitled(business)) {
    return { error: billingRequiredResponse(business) };
  }
  return { ok: true };
}

/**
 * Gate an API route to a plan module.
 * Expired pilots are blocked before module checks.
 */
export function requirePlanModule(
  business: BusinessBillingFields,
  module: PlanModule,
): { plan: PaidPlanId | "pilot" | "expired" } | { error: NextResponse } {
  const billing = requireActiveBilling(business);
  if ("error" in billing) return billing;

  const plan = getEffectivePlanId(business);
  if (!canAccessModule(plan, module)) {
    return { error: planUpgradeResponse(module) };
  }
  return { plan };
}

export function getPlanTechLimit(business: BusinessBillingFields): number | null {
  if (!isBillingEntitled(business)) return 0;
  const plan = getEffectivePlanId(business);
  return getFeatureSetForPlan(plan).maxTechnicians;
}
