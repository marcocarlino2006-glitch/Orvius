import type { PaidPlanId } from "@/lib/pricing-plans";
import { getPlanById } from "@/lib/pricing-plans";

/** Why a shop comes to Orvius — maps to the right plan. */
export type ShopNeedId =
  | "after-hours"
  | "lead-to-job"
  | "dispatch-fleet";

export type ShopNeed = {
  id: ShopNeedId;
  label: string;
  detail: string;
  planId: PaidPlanId;
};

export type ShopSizeId = "solo" | "growing" | "fleet";

export type ShopSize = {
  id: ShopSizeId;
  label: string;
  trucks: string;
  planId: PaidPlanId;
};

export const shopNeeds: readonly ShopNeed[] = [
  {
    id: "after-hours",
    label: "I miss calls when I'm on a job",
    detail: "After-hours and overflow coverage with owner SMS alerts.",
    planId: "line",
  },
  {
    id: "lead-to-job",
    label: "Leads don't become booked jobs",
    detail: "Inbox, customers, jobs, and dispatch in one workspace.",
    planId: "pro",
  },
  {
    id: "dispatch-fleet",
    label: "Dispatching 6+ techs is chaos",
    detail: "Multi-truck dispatch with priority support.",
    planId: "fleet",
  },
] as const;

export const shopSizes: readonly ShopSize[] = [
  {
    id: "solo",
    label: "Solo or 1–2 trucks",
    trucks: "1–2",
    planId: "line",
  },
  {
    id: "growing",
    label: "Growing shop",
    trucks: "3–5",
    planId: "pro",
  },
  {
    id: "fleet",
    label: "Fleet operation",
    trucks: "6+",
    planId: "fleet",
  },
] as const;

export type PlanRecommendation = {
  planId: PaidPlanId;
  planName: string;
  price: number;
  reason: string;
  matchedNeed: ShopNeedId | null;
  matchedSize: ShopSizeId | null;
};

export function recommendPlan(input: {
  need?: ShopNeedId | null;
  size?: ShopSizeId | null;
}): PlanRecommendation {
  const need = input.need ? shopNeeds.find((n) => n.id === input.need) : null;
  const size = input.size ? shopSizes.find((s) => s.id === input.size) : null;

  let planId: PaidPlanId = "pro";

  if (need && size) {
    const rank: Record<PaidPlanId, number> = { line: 1, pro: 2, fleet: 3 };
    planId =
      rank[need.planId] >= rank[size.planId] ? need.planId : size.planId;
  } else if (need) {
    planId = need.planId;
  } else if (size) {
    planId = size.planId;
  }

  const plan = getPlanById(planId);
  const reasons: string[] = [];
  if (need) reasons.push(need.detail);
  if (size) reasons.push(`${size.label} (${size.trucks} trucks)`);

  return {
    planId,
    planName: plan.name,
    price: plan.price,
    reason: reasons.join(" · ") || plan.tagline,
    matchedNeed: need?.id ?? null,
    matchedSize: size?.id ?? null,
  };
}

export function getNeedById(id: ShopNeedId): ShopNeed {
  const need = shopNeeds.find((n) => n.id === id);
  if (!need) throw new Error(`Unknown need: ${id}`);
  return need;
}
