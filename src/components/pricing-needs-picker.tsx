"use client";

import { useMemo, useState } from "react";
import {
  recommendPlan,
  shopNeeds,
  shopSizes,
  type ShopNeedId,
  type ShopSizeId,
} from "@/lib/plan-needs";
import type { PaidPlanId } from "@/lib/pricing-plans";

type PricingNeedsPickerProps = {
  onRecommend?: (planId: PaidPlanId) => void;
};

export function PricingNeedsPicker({ onRecommend }: PricingNeedsPickerProps) {
  const [need, setNeed] = useState<ShopNeedId | null>(null);
  const [size, setSize] = useState<ShopSizeId | null>(null);

  const recommendation = useMemo(
    () => recommendPlan({ need, size }),
    [need, size],
  );

  function selectNeed(id: ShopNeedId) {
    setNeed(id);
    const next = recommendPlan({ need: id, size });
    onRecommend?.(next.planId);
  }

  function selectSize(id: ShopSizeId) {
    setSize(id);
    const next = recommendPlan({ need, size: id });
    onRecommend?.(next.planId);
  }

  return (
    <section className="pricing-needs" aria-label="Find your plan">
      <div className="pricing-needs-head font-sans">
        <p className="pricing-needs-kicker type-eyebrow">Start with your need</p>
        <h2 className="pricing-needs-title type-headline">Which plan fits your shop?</h2>
        <p className="pricing-needs-lead type-lead">
          Pick what you need most — we will highlight the right plan below.
        </p>
      </div>

      <div className="pricing-needs-grid">
        <fieldset className="pricing-needs-fieldset">
          <legend className="pricing-needs-legend font-sans">Primary need</legend>
          <ul className="pricing-needs-options">
            {shopNeeds.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`pricing-needs-option font-sans ${need === item.id ? "pricing-needs-option-active" : ""}`}
                  onClick={() => selectNeed(item.id)}
                >
                  <span className="pricing-needs-option-label">{item.label}</span>
                  <span className="pricing-needs-option-detail">{item.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="pricing-needs-fieldset">
          <legend className="pricing-needs-legend font-sans">Shop size</legend>
          <ul className="pricing-needs-options pricing-needs-options-compact">
            {shopSizes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`pricing-needs-option font-sans ${size === item.id ? "pricing-needs-option-active" : ""}`}
                  onClick={() => selectSize(item.id)}
                >
                  <span className="pricing-needs-option-label">{item.label}</span>
                  <span className="pricing-needs-option-detail">{item.trucks} trucks</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>

      {need || size ? (
        <div className="pricing-needs-result font-sans" role="status">
          <p className="pricing-needs-result-kicker type-eyebrow">Recommended</p>
          <p className="pricing-needs-result-plan">
            {recommendation.planName} · ${recommendation.price}/mo
          </p>
          <p className="pricing-needs-result-reason">{recommendation.reason}</p>
        </div>
      ) : null}
    </section>
  );
}
