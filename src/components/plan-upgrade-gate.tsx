"use client";

import Link from "next/link";
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

  if (loading) {
    return (
      <div className="plan-upgrade-gate plan-upgrade-gate-loading font-sans">
        Loading…
      </div>
    );
  }

  const effectivePlan = access?.effectivePlan ?? "pilot";
  if (canAccessModule(effectivePlan, module)) {
    return children;
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
