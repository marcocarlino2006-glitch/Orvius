"use client";

import { useEffect, useState } from "react";
import {
  getEffectivePlanId,
  canAccessModule,
  navHrefToModule,
} from "@/lib/plan-features";
import type { PaidPlanId } from "@/lib/pricing-plans";

export type PlanAccess = {
  effectivePlan: PaidPlanId | "pilot";
  billingStatus: string;
  billingPlan: string | null;
  canAccess: (module: ReturnType<typeof navHrefToModule> extends infer M ? NonNullable<M> : never) => boolean;
};

export function usePlanAccess(): {
  access: PlanAccess | null;
  loading: boolean;
} {
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => {
        const billingStatus = data.business?.billingStatus ?? data.billing?.status ?? "none";
        const billingPlan = data.business?.billingPlan ?? data.billing?.planId ?? null;
        const effectivePlan = getEffectivePlanId({ billingStatus, billingPlan });

        setAccess({
          effectivePlan,
          billingStatus,
          billingPlan,
          canAccess: (module) => canAccessModule(effectivePlan, module),
        });
      })
      .catch(() => setAccess(null))
      .finally(() => setLoading(false));
  }, []);

  return { access, loading };
}
