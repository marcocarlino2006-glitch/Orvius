"use client";

import { Fragment } from "react";
import {
  pricingCompareColumns,
  pricingFeatureCategories,
  pricingFeatureMatrix,
  type FeatureCell,
} from "@/lib/pricing-feature-matrix";
import { getPlanById, type PlanId } from "@/lib/pricing-plans";

function CellValue({ value }: { value: FeatureCell }) {
  if (value === true) {
    return (
      <span className="pricing-matrix-yes" aria-label="Included">
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="pricing-matrix-no" aria-label="Not included">
        —
      </span>
    );
  }
  return <span className="pricing-matrix-text">{value}</span>;
}

function cell(row: (typeof pricingFeatureMatrix)[number], planId: PlanId, selfServeReady: boolean): FeatureCell {
  if (row.id === "onboarding" && !selfServeReady) return "Guided";
  return row.values[planId];
}

export function PricingFeatureMatrix({ selfServeReady = true }: { selfServeReady?: boolean }) {
  const rows = pricingFeatureMatrix.filter((row) =>
    pricingCompareColumns.some((planId) => row.values[planId] !== false),
  );
  return (
    <section className="pricing-matrix" aria-label="Plan comparison">
      <div className="pricing-matrix-head font-sans">
        <p className="pricing-matrix-kicker type-eyebrow">Compare plans</p>
        <h2 className="pricing-matrix-title type-headline">What each plan includes.</h2>
        <p className="pricing-matrix-lead type-lead">
          Pick the plan you need today. Upgrade when the shop grows.
        </p>
      </div>

      <div className="pricing-matrix-scroll" role="region" aria-label="Plan comparison table, scrolls sideways" tabIndex={0}>
        <table className="pricing-matrix-table font-sans">
          <thead>
            <tr>
              <th scope="col" className="pricing-matrix-feature-col">
                Feature
              </th>
              {pricingCompareColumns.map((planId) => {
                const plan = getPlanById(planId);
                return (
                  <th key={planId} scope="col" className="pricing-matrix-plan-col">
                    {plan.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pricingFeatureCategories.map((category) => (
              <Fragment key={category}>
                <tr className="pricing-matrix-category-row">
                  <th colSpan={pricingCompareColumns.length + 1} scope="rowgroup">
                    {category}
                  </th>
                </tr>
                {rows
                  .filter((row) => row.category === category)
                  .map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="pricing-matrix-feature-label">
                        {row.label}
                      </th>
                      {pricingCompareColumns.map((planId) => (
                        <td key={`${row.id}-${planId}`} className="pricing-matrix-cell">
                          <CellValue value={cell(row, planId, selfServeReady)} />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pricing-matrix-footnote font-sans">
        Call-audit shops get full Pro during setup (30 days).
      </p>
    </section>
  );
}
