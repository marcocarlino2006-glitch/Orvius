"use client";

import { useState } from "react";
import { PricingNeedsPicker } from "@/components/pricing-needs-picker";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import { pricingPlans } from "@/lib/company";
import type { PaidPlanId } from "@/lib/pricing-plans";

export function PricingPagePlans() {
  const [recommendedPlanId, setRecommendedPlanId] = useState<PaidPlanId | null>(
    null,
  );

  return (
    <>
      <div className="editorial-wrap">
        <PricingNeedsPicker onRecommend={setRecommendedPlanId} />
      </div>
      <div className="editorial-wrap tier1-pricing-plans">
        {pricingPlans.map((plan) => (
          <PricingPlanCard
            key={plan.id}
            plan={plan}
            recommended={
              recommendedPlanId != null &&
              plan.id === recommendedPlanId
            }
          />
        ))}
      </div>
    </>
  );
}
