"use client";

import { ANNUAL_DISCOUNT_LABEL } from "@/lib/pricing-plans";

export type BillingInterval = "month" | "year";

type PricingBillingToggleProps = {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
};

export function PricingBillingToggle({ value, onChange }: PricingBillingToggleProps) {
  return (
    <div className="pricing-billing-toggle font-sans" role="group" aria-label="Billing interval">
      <button
        type="button"
        className={`pricing-billing-option ${value === "month" ? "pricing-billing-option-active" : ""}`}
        onClick={() => onChange("month")}
      >
        Monthly
      </button>
      <button
        type="button"
        className={`pricing-billing-option ${value === "year" ? "pricing-billing-option-active" : ""}`}
        onClick={() => onChange("year")}
      >
        Annual
        <span className="pricing-billing-save">{ANNUAL_DISCOUNT_LABEL}</span>
      </button>
    </div>
  );
}
