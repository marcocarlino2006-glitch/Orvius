"use client";

import Link from "next/link";
import { useState } from "react";
import { PricingBillingToggle } from "@/components/pricing-billing-toggle";
import { PricingFAQ } from "@/components/pricing-faq";
import { PricingFeatureMatrix } from "@/components/pricing-feature-matrix";
import { PricingNeedsPicker } from "@/components/pricing-needs-picker";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import {
  getPaidPlans,
  getPlanById,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/pricing-plans";

export function PricingPagePlans({ selfServeReady = true }: { selfServeReady?: boolean }) {
  const paidPlans = getPaidPlans();
  const multi = getPlanById("multi");
  const [interval, setInterval] = useState<BillingInterval>("year");
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
        {paidPlans.map((plan) => (
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
        <div
          className={`pricing-multi-row font-sans ${recommendedPlanId === "multi" ? "pricing-multi-row--recommended" : ""}`}
        >
          <div>
            <p className="pricing-multi-title">
              {multi.name} · ${multi.price} per location a month
            </p>
            <p className="pricing-multi-body">
              {multi.limit}. {multi.highlights.join(" · ")}.
            </p>
          </div>
          <Link href="/enterprise" className="ov-btn ov-btn--quiet">
            See multi-shop
          </Link>
        </div>
      </div>

      <div className="editorial-wrap">
        <PricingFeatureMatrix selfServeReady={selfServeReady} />
      </div>

      <div className="editorial-wrap">
        <PricingFAQ />
      </div>
    </>
  );
}
