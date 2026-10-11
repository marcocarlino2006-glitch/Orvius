import { NextResponse } from "next/server";
import { logWarn } from "@/lib/logger";
import { KEEP_WINDOW_DAYS, keepHeadline, keepRows, smallerPlan } from "@/lib/plan-exit";
import { pauseBlocker, subscriptionPeriodEnd } from "@/lib/plan-pause";
import { getShopOutcomes } from "@/lib/shop-outcomes";
import { getStripe } from "@/lib/stripe";
import { requirePermission } from "@/lib/tenant";

export const runtime = "nodejs";

/** Everything the pause-or-cancel panel shows, read when the owner opens it. */
export async function GET() {
  const authResult = await requirePermission("billing.manage", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const outcomes = await getShopOutcomes(business.id, KEEP_WINDOW_DAYS);
  const counts = {
    calls: outcomes.calls,
    afterHoursLeads: outcomes.afterHoursLeads,
    jobsBooked: outcomes.jobsBooked,
    collectedCents: outcomes.collectedCents,
  };

  let periodEnd: Date | null = null;
  let cancelScheduled = false;
  if (business.stripeSubscriptionId) {
    try {
      const subscription = await getStripe().subscriptions.retrieve(business.stripeSubscriptionId);
      periodEnd = subscriptionPeriodEnd(subscription);
      cancelScheduled = Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
    } catch (error) {
      logWarn("billing.exit_period_failed", { businessId: business.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const blocker = cancelScheduled ? "This plan is already set to cancel." : pauseBlocker(business);
  return NextResponse.json({
    headline: keepHeadline(counts),
    rows: keepRows(counts),
    windowDays: KEEP_WINDOW_DAYS,
    periodEnd: periodEnd?.toISOString() ?? null,
    interval: business.billingInterval === "year" ? "year" : "month",
    cancelScheduled,
    pause: { available: !blocker && Boolean(periodEnd), blocker },
    smallerPlan: smallerPlan(business.billingPlan),
  });
}
