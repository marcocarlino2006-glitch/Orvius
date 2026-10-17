"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  }, [need, size, multiLocation]);

  const currentStep = STEPS[step]?.id ?? "size";
  const stepCount = STEPS.length;

  function advance() {
    if (step < stepCount - 1) setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function checkSize(id: ShopSizeId) {
    setSize(id);
    onRecommend?.(recommendPlan({ need, size: id }).planId);
  }

  function selectSize(id: ShopSizeId) {
    checkSize(id);
    advance();
  }

  function checkNeed(id: ShopNeedId) {
    setNeed(id);
    onRecommend?.(recommendPlan({ need: id, size }).planId);
  }

  function selectNeed(id: ShopNeedId) {
    checkNeed(id);
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
        <ol className="pricing-wizard-steps" aria-label="Progress">
          {STEPS.map((item, index) => (
            <li
              key={item.id}
              aria-current={index === step ? "step" : undefined}
              className={`pricing-wizard-step ${index === step ? "pricing-wizard-step-active" : ""} ${index < step ? "pricing-wizard-step-done" : ""}`}
            >
              {index + 1}. {item.label}
            </li>
          ))}
        </ol>
      </div>

      {currentStep === "size" ? (
        <ChoiceGroup
          legend="How many trucks do you run?"
          choices={shopSizes.map((item) => ({ value: item.id, label: item.label, detail: `${item.trucks} ${item.trucks === "1" ? "truck" : "trucks"}` }))}
          value={size}
          onCheck={checkSize}
          onPick={selectSize}
        />
      ) : null}

      {currentStep === "need" ? (
        <ChoiceGroup
          legend="What do you need most right now?"
          choices={shopNeeds.map((item) => ({ value: item.id, label: item.label, detail: item.detail }))}
          value={need}
          onCheck={checkNeed}
          onPick={selectNeed}
        >
          <button type="button" className="pricing-wizard-back font-sans" onClick={back}>
            ← Back
          </button>
        </ChoiceGroup>
      ) : null}

      {currentStep === "locations" ? (
        <ChoiceGroup
          legend="Do you operate more than one location?"
          compact
          choices={[
            { value: false, label: "One shop", detail: "Single location" },
            { value: true, label: "Multiple locations", detail: "2+ shops or franchise" },
          ]}
          value={multiLocation}
          onCheck={selectLocations}
          onPick={selectLocations}
        >
          <button type="button" className="pricing-wizard-back font-sans" onClick={back}>
            ← Back
          </button>
        </ChoiceGroup>
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

type Choice<T> = { value: T; label: ReactNode; detail: ReactNode };

/**
 * One question as a radio group: arrow keys move the choice without leaving
 * the step, Enter, Space or a click picks it and moves on.
 */
function ChoiceGroup<T extends string | boolean>({
  legend,
  choices,
  value,
  onCheck,
  onPick,
  compact,
  children,
}: {
  legend: string;
  choices: Choice<T>[];
  value: T | null;
  onCheck: (value: T) => void;
  onPick: (value: T) => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  const legendId = useId();
  const list = useRef<HTMLUListElement>(null);
  const checked = choices.findIndex((c) => c.value === value);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + choices.length) % choices.length;
    onCheck(choices[next].value);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <fieldset className="pricing-wizard-panel">
      <legend id={legendId} className="pricing-wizard-legend font-sans">
        {legend}
      </legend>
      <ul ref={list} className={`pricing-needs-options${compact ? " pricing-needs-options-compact" : ""}`} role="radiogroup" aria-labelledby={legendId}>
        {choices.map((choice, index) => {
          const on = index === checked;
          return (
            <li key={String(choice.value)} role="presentation">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (checked === -1 && index === 0) ? 0 : -1}
                className={`pricing-needs-option font-sans ${on ? "pricing-needs-option-active" : ""}`}
                onClick={() => onPick(choice.value)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="pricing-needs-option-label">{choice.label}</span>
                <span className="pricing-needs-option-detail">{choice.detail}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {children}
    </fieldset>
  );
}
