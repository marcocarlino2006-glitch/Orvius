"use client";

import { useState } from "react";
import { PricingBillingToggle } from "@/components/pricing-billing-toggle";
import { PricingFAQ } from "@/components/pricing-faq";
import { PricingFeatureMatrix } from "@/components/pricing-feature-matrix";
import { PricingNeedsPicker } from "@/components/pricing-needs-picker";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import { pricingPlans, type BillingInterval, type PaidPlanId } from "@/lib/pricing-plans";

export function PricingPagePlans() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [recommendedPlanId, setRecommendedPlanId] = useState<
    PaidPlanId | "multi" | null
  >(null);

  return (
    <>
      <div className="editorial-wrap">
        <PricingNeedsPicker
          interval={interval}
          onRecommend={setRecommendedPlanId}
        />
      </div>

      <div className="editorial-wrap pricing-page-controls">
        <PricingBillingToggle value={interval} onChange={setInterval} />
        <p className="pricing-page-controls-note font-sans">
          Prices shown as monthly equivalent. Annual plans billed once per year.
        </p>
      </div>

      <div className="editorial-wrap tier1-pricing-plans">
        {pricingPlans.map((plan) => (
          <PricingPlanCard
            key={plan.id}
            plan={plan}
            interval={interval}
            recommended={
              recommendedPlanId != null &&
              plan.id === recommendedPlanId
            }
          />
        ))}
      </div>

      <div className="editorial-wrap">
        <PricingFeatureMatrix />
      </div>

      <div className="editorial-wrap">
        <PricingFAQ />
      </div>
    </>
  );
}
