/**
 * Fair-use allowances — what each plan actually includes.
 * Flat SaaS price, capped included usage so Twilio/Vapi cost is bounded.
 * Soft overage for now (warn + sales); hard metered Stripe prices come later.
 */

import type { PaidPlanId, PlanId } from "@/lib/pricing-plans";

export type PlanUsageAllowance = {
  /** Included answered / handled minutes per calendar month */
  answeredMinutes: number;
  /** Included owner/alert SMS segments per calendar month */
  ownerSms: number;
  /** Human-readable overage policy until Stripe meters ship */
  overagePolicy: string;
};

export const planUsageAllowances: Record<PaidPlanId, PlanUsageAllowance> = {
  line: {
    answeredMinutes: 300,
    ownerSms: 200,
    overagePolicy:
      "Past fair use we email you and quote overage ($0.12/min answered, $0.03/SMS) before charging.",
  },
  pro: {
    answeredMinutes: 750,
    ownerSms: 500,
    overagePolicy:
      "Past fair use we email you and quote overage ($0.12/min answered, $0.03/SMS) before charging.",
  },
  fleet: {
    answeredMinutes: 2000,
    ownerSms: 1500,
    overagePolicy:
      "Past fair use we email you and quote overage ($0.10/min answered, $0.025/SMS) before charging.",
  },
};

/** Rough unit economics for founder honesty — not customer-facing prices. */
export const usageUnitEconomics = {
  answeredMinuteTargetCostUsd: 0.04,
  ownerSmsTargetCostUsd: 0.01,
  overageAnsweredMinuteUsd: 0.12,
  overageSmsUsd: 0.03,
  fleetOverageAnsweredMinuteUsd: 0.1,
  fleetOverageSmsUsd: 0.025,
} as const;

export function getUsageAllowance(
  plan: PaidPlanId | "pilot" | "multi" | "expired",
): PlanUsageAllowance | null {
  if (plan === "pilot") return planUsageAllowances.pro;
  if (plan === "line" || plan === "pro" || plan === "fleet") {
    return planUsageAllowances[plan];
  }
  return null;
}

export function usageHighlightLines(planId: PlanId): string[] {
  if (planId === "pilot") {
    return [
      "Fair use during trial matches Pro (750 answered min / 500 SMS)",
    ];
  }
  if (planId === "multi") {
    return ["Usage pooled per location — sized in the design-partner quote"];
  }
  if (planId !== "line" && planId !== "pro" && planId !== "fleet") return [];
  const u = planUsageAllowances[planId];
  return [
    `${u.answeredMinutes.toLocaleString()} answered minutes / month included`,
    `${u.ownerSms.toLocaleString()} owner SMS / month included`,
    "Soft overage — we warn before any extra charge",
  ];
}

export type UsageSnapshot = {
  planId: PaidPlanId | "pilot" | "expired";
  periodStart: Date;
  periodEnd: Date;
  answeredMinutesUsed: number;
  answeredMinutesIncluded: number | null;
  ownerSmsUsed: number;
  ownerSmsIncluded: number | null;
  answeredMinutesPct: number | null;
  ownerSmsPct: number | null;
  nearLimit: boolean;
};

export function buildUsageSnapshot(input: {
  planId: PaidPlanId | "pilot" | "expired";
  answeredSecondsUsed: number;
  ownerSmsUsed: number;
  now?: Date;
}): UsageSnapshot {
  const now = input.now ?? new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const allowance = getUsageAllowance(input.planId);
  const answeredMinutesUsed = Math.ceil(Math.max(0, input.answeredSecondsUsed) / 60);
  const answeredMinutesIncluded = allowance?.answeredMinutes ?? null;
  const ownerSmsIncluded = allowance?.ownerSms ?? null;
  const answeredMinutesPct =
    answeredMinutesIncluded && answeredMinutesIncluded > 0
      ? Math.min(999, Math.round((answeredMinutesUsed / answeredMinutesIncluded) * 100))
      : null;
  const ownerSmsPct =
    ownerSmsIncluded && ownerSmsIncluded > 0
      ? Math.min(999, Math.round((input.ownerSmsUsed / ownerSmsIncluded) * 100))
      : null;
  const nearLimit =
    (answeredMinutesPct != null && answeredMinutesPct >= 80) ||
    (ownerSmsPct != null && ownerSmsPct >= 80);

  return {
    planId: input.planId,
    periodStart,
    periodEnd,
    answeredMinutesUsed,
    answeredMinutesIncluded,
    ownerSmsUsed: input.ownerSmsUsed,
    ownerSmsIncluded,
    answeredMinutesPct,
    ownerSmsPct,
    nearLimit,
  };
}
