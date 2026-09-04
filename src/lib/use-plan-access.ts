"use client";

import { useEffect, useState } from "react";
import {
  isBillingEntitled,
  resolvePilotEndsAt,
} from "@/lib/billing-entitlement";
import {
  canAccessModule,
  getEffectivePlanId,
  navHrefToModule,
} from "@/lib/plan-features";
import type { PaidPlanId } from "@/lib/pricing-plans";

export type PlanAccess = {
  effectivePlan: PaidPlanId | "pilot" | "expired";
  billingStatus: string;
  billingPlan: string | null;
  entitled: boolean;
  pilotEndsAt: string | null;
  canAccess: (
    module: ReturnType<typeof navHrefToModule> extends infer M
      ? NonNullable<M>
      : never,
  ) => boolean;
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
        const billingStatus =
          data.business?.billingStatus ?? data.billing?.status ?? "none";
        const billingPlan =
          data.business?.billingPlan ?? data.billing?.planId ?? null;
        const pilotEndsAt = data.business?.pilotEndsAt ?? null;
        const createdAt = data.business?.createdAt ?? null;
        const fields = { billingStatus, billingPlan, pilotEndsAt, createdAt };
        const effectivePlan = getEffectivePlanId(fields);
        const ends = resolvePilotEndsAt(fields);

        setAccess({
          effectivePlan,
          billingStatus,
          billingPlan,
          entitled: isBillingEntitled(fields),
          pilotEndsAt: ends?.toISOString() ?? null,
          canAccess: (module) => canAccessModule(effectivePlan, module),
        });
      })
      .catch(() => setAccess(null))
      .finally(() => setLoading(false));
  }, []);

  return { access, loading };
}
