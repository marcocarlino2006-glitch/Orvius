"use client";

import { useMemo, useState } from "react";
import {
  recommendPlan,
  shopNeeds,
  shopSizes,
  type ShopNeedId,
  type ShopSizeId,
} from "@/lib/plan-needs";
import {
  getPlanById,
  getPlanPrice,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/pricing-plans";

type PricingNeedsPickerProps = {
  onRecommend?: (planId: PaidPlanId | "multi") => void;
  interval?: BillingInterval;
};

const STEPS = [
  { id: "size", label: "Shop size" },
  { id: "need", label: "Primary need" },
  { id: "locations", label: "Locations" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function PricingNeedsPicker({
  onRecommend,
  interval = "month",
}: PricingNeedsPickerProps) {
  const [step, setStep] = useState(0);
  const [need, setNeed] = useState<ShopNeedId | null>(null);
  const [size, setSize] = useState<ShopSizeId | null>(null);
  const [multiLocation, setMultiLocation] = useState<boolean | null>(null);

  const recommendation = useMemo(() => {
    if (multiLocation) {
      return {
        planId: "multi" as const,
        planName: "Multi-shop",
        price: 0,
        reason: "2+ locations — dedicated lines per shop with central billing",
      };
    }
    return recommendPlan({ need, size });
  }, [need, size, multiLocation, interval]);

  const currentStep = STEPS[step]?.id ?? "size";
  const stepCount = STEPS.length;

  function advance() {
    if (step < stepCount - 1) setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function selectSize(id: ShopSizeId) {
    setSize(id);
    const next = recommendPlan({ need, size: id });
    onRecommend?.(next.planId);
    advance();
  }

  function selectNeed(id: ShopNeedId) {
    setNeed(id);
    const next = recommendPlan({ need: id, size });
    onRecommend?.(next.planId);
    advance();
  }

  function selectLocations(multi: boolean) {
    setMultiLocation(multi);
    if (multi) {
      onRecommend?.("multi");
    } else if (size && need) {
      onRecommend?.(recommendPlan({ need, size }).planId);
    }
  }

  const displayPrice = useMemo(() => {
    if (multiLocation) return "Custom";
    const rec = recommendPlan({ need, size });
    const plan = getPlanById(rec.planId);
    return `$${getPlanPrice(plan, interval)}/mo`;
  }, [multiLocation, need, size, interval]);

  return (
    <section className="pricing-wizard" aria-label="Find your plan">
      <div className="pricing-wizard-head font-sans">
        <p className="pricing-wizard-kicker type-eyebrow">Plan finder</p>
        <h2 className="pricing-wizard-title type-headline">Which plan fits your shop?</h2>
        <nav className="pricing-wizard-steps" aria-label="Progress">
          {STEPS.map((item, index) => (
            <span
              key={item.id}
              className={`pricing-wizard-step ${index === step ? "pricing-wizard-step-active" : ""} ${index < step ? "pricing-wizard-step-done" : ""}`}
            >
              {index + 1}. {item.label}
            </span>
          ))}
        </nav>
      </div>

      {currentStep === "size" ? (
        <fieldset className="pricing-wizard-panel">
          <legend className="pricing-wizard-legend font-sans">
            How many trucks do you run?
          </legend>
          <ul className="pricing-needs-options">
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
      ) : null}

      {currentStep === "need" ? (
        <fieldset className="pricing-wizard-panel">
          <legend className="pricing-wizard-legend font-sans">
            What do you need most right now?
          </legend>
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
          <button type="button" className="pricing-wizard-back font-sans" onClick={back}>
            ← Back
          </button>
        </fieldset>
      ) : null}

      {currentStep === "locations" ? (
        <fieldset className="pricing-wizard-panel">
          <legend className="pricing-wizard-legend font-sans">
            Do you operate more than one location?
          </legend>
          <ul className="pricing-needs-options pricing-needs-options-compact">
            <li>
              <button
                type="button"
                className={`pricing-needs-option font-sans ${multiLocation === false ? "pricing-needs-option-active" : ""}`}
                onClick={() => selectLocations(false)}
              >
                <span className="pricing-needs-option-label">One shop</span>
                <span className="pricing-needs-option-detail">Single location</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`pricing-needs-option font-sans ${multiLocation === true ? "pricing-needs-option-active" : ""}`}
                onClick={() => selectLocations(true)}
              >
                <span className="pricing-needs-option-label">Multiple locations</span>
                <span className="pricing-needs-option-detail">2+ shops or franchise</span>
              </button>
            </li>
          </ul>
          <button type="button" className="pricing-wizard-back font-sans" onClick={back}>
            ← Back
          </button>
        </fieldset>
      ) : null}

      {(need || size || multiLocation !== null) && step === stepCount - 1 ? (
        <div className="pricing-needs-result font-sans" role="status">
          <p className="pricing-needs-result-kicker type-eyebrow">Recommended</p>
          <p className="pricing-needs-result-plan">
            {recommendation.planName} · {displayPrice}
          </p>
          <p className="pricing-needs-result-reason">{recommendation.reason}</p>
        </div>
      ) : null}
    </section>
  );
}
