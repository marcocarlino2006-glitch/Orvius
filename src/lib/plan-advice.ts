import { includedCallsForPlan } from "@/lib/call-usage";
import { getPlanById, OVERAGE_CENTS_PER_CALL } from "@/lib/pricing-plans";

/*
  The price only keeps a shop if the shop thinks it is fair. So the advice is
  the cheapest plan for the calls the shop is actually taking, even when that
  is the plan it is already on, and it never says "upgrade" on a hunch: only
  when the bigger plan costs less than the extra calls would.
*/

const SELF_SERVE = ["line", "pro", "fleet"] as const;
type SelfServePlan = (typeof SELF_SERVE)[number];

/** A switch has to save at least this much in a month to be worth suggesting. */
const MIN_SAVING_CENTS = 2_000;

export function monthCostCents(planId: SelfServePlan, calls: number): number {
  const over = Math.max(0, calls - includedCallsForPlan(planId));
  return getPlanById(planId).price * 100 + over * OVERAGE_CENTS_PER_CALL;
}

/** Calls by the end of the month at the pace so far. The first two days are too few to project from. */
export function projectMonthCalls(used: number, now = new Date()): number {
  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  if (day < 3) return used;
  const elapsed = (day - 1 + (now.getUTCHours() + now.getUTCMinutes() / 60) / 24) / daysInMonth;
  return Math.max(used, Math.round(used / Math.max(elapsed, 1 / daysInMonth)));
}

export type PlanAdvice = {
  projected: number;
  projectedOverageCents: number;
  /** The cheaper plan for this month's pace, when switching saves real money. */
  switchTo: { id: SelfServePlan; name: string; savesCents: number } | null;
};

export function planAdvice(params: { used: number; planId: string | null | undefined; now?: Date }): PlanAdvice | null {
  const current = SELF_SERVE.find((id) => id === params.planId);
  if (!current) return null;
  const projected = projectMonthCalls(params.used, params.now);
  const currentCost = monthCostCents(current, projected);
  const cheapest = SELF_SERVE.map((id) => ({ id, cost: monthCostCents(id, projected) })).sort((a, b) => a.cost - b.cost)[0];
  const savesCents = currentCost - cheapest.cost;
  return {
    projected,
    projectedOverageCents: Math.max(0, projected - includedCallsForPlan(current)) * OVERAGE_CENTS_PER_CALL,
    switchTo:
      cheapest.id !== current && savesCents >= MIN_SAVING_CENTS && SELF_SERVE.indexOf(cheapest.id) > SELF_SERVE.indexOf(current)
        ? { id: cheapest.id, name: getPlanById(cheapest.id).name, savesCents }
        : null,
  };
}

const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** One plain sentence for the meter and the usage text. */
export function planAdviceLine(advice: PlanAdvice, currentPlanName: string): string {
  const pace = `At this pace you'll take about ${advice.projected.toLocaleString("en-US")} calls this month`;
  if (advice.switchTo) {
    return `${pace}. ${advice.switchTo.name} would cost about ${dollars(advice.switchTo.savesCents)} less than ${currentPlanName} plus extra calls.`;
  }
  if (advice.projectedOverageCents > 0) {
    return `${pace}, about ${dollars(advice.projectedOverageCents)} in extra calls. ${currentPlanName} is still your cheapest plan.`;
  }
  return `${pace}, inside your allowance.`;
}
