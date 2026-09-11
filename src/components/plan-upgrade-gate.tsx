"use client";

import Link from "next/link";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { usePlanAccess } from "@/lib/use-plan-access";
import { getPlanById } from "@/lib/pricing-plans";
import {
  canAccessModule,
  minimumPlanForModule,
  moduleLabel,
  type PlanModule,
} from "@/lib/plan-features";

type PlanUpgradeGateProps = {
  module: PlanModule;
  children: React.ReactNode;
};

export function PlanUpgradeGate({ module, children }: PlanUpgradeGateProps) {
  const { access, loading } = usePlanAccess();

  /*
    The plan check resolves before the page's own fetch, so this state is the
    first thing an owner sees on Customers, Jobs, Dispatch and Ask. It used to
    be the words "Loading…" in a div with no stylesheet behind it —
    plan-upgrade-gate-loading was never declared — which put unstyled 16px text
    in the corner of an otherwise finished shell on every visit to four routes.

    Showing the skeleton the wrapped page shows makes the two loads one: gate,
    then page, then content, with nothing changing shape in between. The
    aria-busy it carries also matters off-screen — every audit in scripts/ waits
    on that attribute before measuring, so without it these four routes were
    being measured mid-load.
  */
  if (loading) return <DashboardSkeleton />;

  const effectivePlan = access?.effectivePlan ?? "pilot";
  if (canAccessModule(effectivePlan, module)) {
    return children;
  }

  if (effectivePlan === "expired" || access?.entitled === false) {
    return (
      <div className="plan-upgrade-gate">
        <div className="plan-upgrade-gate-inner font-sans">
          <p className="plan-upgrade-gate-kicker">{moduleLabel(module)}</p>
          <h2 className="plan-upgrade-gate-title">Subscribe to continue</h2>
          <p className="plan-upgrade-gate-detail">
            Your pilot ended or subscription is inactive. Choose a plan to reopen{" "}
            {moduleLabel(module).toLowerCase()} and the rest of your shop.
          </p>
          <div className="plan-upgrade-gate-actions">
            <Link href="/dashboard/billing" className="btn btn-void text-sm">
              Open billing
            </Link>
            <Link href="/dashboard/pricing" className="btn btn-secondary text-sm">
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const requiredPlanId = minimumPlanForModule(module);
  const requiredPlan = getPlanById(requiredPlanId);

  return (
    <div className="plan-upgrade-gate">
      <div className="plan-upgrade-gate-inner font-sans">
        <p className="plan-upgrade-gate-kicker">{moduleLabel(module)}</p>
        <h2 className="plan-upgrade-gate-title">
          Included on {requiredPlan.name}
        </h2>
        <p className="plan-upgrade-gate-detail">
          Your Line plan covers calls, inbox, and owner alerts. Upgrade to{" "}
          {requiredPlan.name} (${requiredPlan.price}/mo) for{" "}
          {moduleLabel(module).toLowerCase()}, jobs, dispatch, and Ask.
        </p>
        <div className="plan-upgrade-gate-actions">
          <Link href="/dashboard/pricing" className="btn btn-void text-sm">
            Compare plans
          </Link>
          <Link href="/dashboard/billing" className="btn btn-secondary text-sm">
            Upgrade · ${requiredPlan.price}/mo
          </Link>
        </div>
      </div>
    </div>
  );
}
