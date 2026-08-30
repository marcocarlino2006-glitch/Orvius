import { pricingComparison } from "@/lib/trust";

export function PricingComparison() {
  return (
    <div className="pricing-compare" aria-label="Pricing comparison">
      {pricingComparison.map((row) => (
        <div
          key={row.label}
          className={`pricing-compare-row ${row.highlight ? "pricing-compare-row-highlight" : ""}`}
        >
          <p className="pricing-compare-label font-sans">{row.label}</p>
          <p className="pricing-compare-cost font-serif">{row.cost}</p>
          <p className="pricing-compare-pain font-sans">{row.pain}</p>
        </div>
      ))}
    </div>
  );
}
