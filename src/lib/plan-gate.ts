import { NextResponse } from "next/server";
import { pauseDate } from "@/lib/plan-exit";
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

export type BillingLock = { reason: NonNullable<ReturnType<typeof billingLockReason>>; message: string };

export function billingLock(business: BusinessBillingFields): BillingLock {
  const reason = billingLockReason(business) ?? "unpaid";
  const message =
    reason === "trial_ended"
      ? "Your access ended. Pay with card to keep using Orvius."
      : reason === "canceled"
        ? "Subscription canceled. Pay with card to reopen your shop."
        : reason === "past_due"
          ? "Payment failed. Update billing to continue."
          : reason === "paused"
            ? `Orvius is paused until ${pauseDate(business.pausedUntil)}. Resume on Billing to book, text and dispatch again.`
            : "Pay with card to use Orvius.";
  return { reason, message };
}

export function billingRequiredResponse(business: BusinessBillingFields) {
  const { reason, message } = billingLock(business);
  return NextResponse.json(
    {
      error: message,
      code: "billing_required",
      reason,
      upgrade: "pro",
    },
    { status: 402 },
  );
}

/*
  A shop whose access ended can still read its own records: it signs in to its
  calls, customers and jobs, not to a wall. Anything that writes or sends stays
  locked. The session gate marks the business object for a read request only.
*/
const readOnlyLocked = new WeakSet<object>();

export function allowLockedRead(business: object) {
  readOnlyLocked.add(business);
}

export function isLockedRead(business: object) {
  return readOnlyLocked.has(business);
}

/** Hard gate: expired / canceled shops cannot use product APIs, beyond reading. */
export function requireActiveBilling(
  business: BusinessBillingFields,
): { ok: true } | { error: NextResponse } {
  if (!isBillingEntitled(business) && !isLockedRead(business)) {
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
  if (plan !== "expired" && !canAccessModule(plan, module)) {
    return { error: planUpgradeResponse(module) };
  }
  return { plan };
}

export function getPlanTechLimit(business: BusinessBillingFields): number | null {
  if (!isBillingEntitled(business)) return 0;
  const plan = getEffectivePlanId(business);
  return getFeatureSetForPlan(plan).maxTechnicians;
}
