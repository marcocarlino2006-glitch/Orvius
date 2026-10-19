"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MONEY_BACK_DAYS } from "@/lib/money-back";
import { PricingBillingToggle } from "@/components/pricing-billing-toggle";
import { PricingFAQ } from "@/components/pricing-faq";
import { PricingFeatureMatrix } from "@/components/pricing-feature-matrix";
import { PricingNeedsPicker } from "@/components/pricing-needs-picker";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import {
  OVERAGE_CENTS_PER_CALL,
  getPaidPlans,
  getPlanById,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/pricing-plans";

export function PricingPagePlans({ selfServeReady = true, terms }: { selfServeReady?: boolean; terms?: ReactNode }) {
  const paidPlans = getPaidPlans();
  const multi = getPlanById("multi");
  /* Lead with the monthly price a shop actually pays month to month;
     annual is the discount a toggle away, never the first number seen. */
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [recommendedPlanId, setRecommendedPlanId] = useState<
    PaidPlanId | "multi" | null
  >(null);

  return (
    <>
      <section className="tier1-story ov-chapter" aria-label="Choose a plan">
        <div className="editorial-wrap">
          <PricingNeedsPicker
            interval={interval}
            onRecommend={setRecommendedPlanId}
          />
        </div>

        <div className="editorial-wrap pricing-page-controls">
          <PricingBillingToggle value={interval} onChange={setInterval} />
          <p className="pricing-page-controls-note font-sans">
            {interval === "year"
              ? `Annual prices are shown per month and charged once a year. Annual prepays the plan only: the included calls are still per month, and calls past them are ${OVERAGE_CENTS_PER_CALL}¢ each, invoiced monthly, the same as on monthly billing.`
              : "Monthly prices, charged each month. Cancel any time."}{" "}
            First {MONEY_BACK_DAYS} days money back, once per shop.{" "}
            Included calls reset on the 1st; each call past the allowance is {OVERAGE_CENTS_PER_CALL}¢, invoiced after the month ends.
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
              outranked={recommendedPlanId != null && plan.id !== recommendedPlanId}
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
      </section>

      <section className="tier1-story ov-chapter ov-surface-canvas pricing-chapter-compare" aria-label="Compare plans">
        <div className="editorial-wrap">
          <PricingFeatureMatrix selfServeReady={selfServeReady} />
        </div>

        {terms ? <div className="editorial-wrap">{terms}</div> : null}
      </section>

      <section className="tier1-story ov-chapter" aria-label="Questions">
        <div className="editorial-wrap">
          <PricingFAQ />
        </div>
      </section>
    </>
  );
}
