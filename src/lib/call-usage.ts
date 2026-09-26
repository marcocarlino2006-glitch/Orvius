import { OVERAGE_CENTS_PER_CALL, getPlanById, type PlanId } from "@/lib/pricing-plans";

export type CallUsage = {
  used: number;
  included: number;
  remaining: number;
  overCalls: number;
  overageCents: number;
  /** 0–1, capped; the meter fills and stays full past the allowance. */
  fraction: number;
  tone: "ok" | "near" | "over";
  periodStart: string;
};

/** First instant of the current calendar month in UTC — the metering window. */
export function usagePeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/*
  Pilot shops run the Pro workspace, so they are metered against Pro. A shop with
  no plan still sees its count against Pro — the number it would buy into.
*/
export function includedCallsForPlan(planId: string | null | undefined): number {
  const id: PlanId =
    planId === "line" || planId === "pro" || planId === "fleet" || planId === "multi" ? planId : "pro";
  return getPlanById(id).includedCalls ?? getPlanById("pro").includedCalls ?? 0;
}

export function summarizeCallUsage(params: {
  used: number;
  planId: string | null | undefined;
  now?: Date;
}): CallUsage {
  const used = Math.max(0, Math.floor(params.used));
  const included = includedCallsForPlan(params.planId);
  const overCalls = Math.max(0, used - included);
  const fraction = included > 0 ? Math.min(1, used / included) : 1;
  return {
    used,
    included,
    remaining: Math.max(0, included - used),
    overCalls,
    overageCents: overCalls * OVERAGE_CENTS_PER_CALL,
    fraction,
    tone: overCalls > 0 ? "over" : fraction >= 0.8 ? "near" : "ok",
    periodStart: usagePeriodStart(params.now).toISOString(),
  };
}

export function callUsageLine(usage: CallUsage): string {
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (usage.overCalls > 0) {
    return `${fmt(usage.used)} calls this month — ${fmt(usage.overCalls)} past the ${fmt(usage.included)} included, every one answered.`;
  }
  return `${fmt(usage.used)} of ${fmt(usage.included)} included calls this month.`;
}
