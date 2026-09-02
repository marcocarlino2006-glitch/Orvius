"use client";

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
        <span className="pricing-billing-save">Save ~17%</span>
      </button>
    </div>
  );
}
