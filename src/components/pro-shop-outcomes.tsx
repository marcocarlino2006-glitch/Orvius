"use client";

import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProShopOutcomesProps = {
  outcomes: ShopOutcomes | null | undefined;
  loading?: boolean;
};

export function ProShopOutcomes({ outcomes, loading }: ProShopOutcomesProps) {
  if (loading && !outcomes) {
    return (
      <section className="shop-outcomes font-sans" aria-label="Shop outcomes">
        <p className="shop-outcomes-kicker type-eyebrow">Last 7 days</p>
        <p className="shop-outcomes-line">Loading outcomes…</p>
      </section>
    );
  }

  if (!outcomes) return null;

  const booking =
    outcomes.bookingRate != null ? `${outcomes.bookingRate}% booked` : "— booked";

  return (
    <section className="shop-outcomes font-sans" aria-label="Shop outcomes">
      <div className="shop-outcomes-head">
        <p className="shop-outcomes-kicker type-eyebrow">
          Last {outcomes.windowDays} days · outcomes
        </p>
        <p className="shop-outcomes-line">
          <strong>{outcomes.calls}</strong> calls ·{" "}
          <strong>{outcomes.leads}</strong> leads ·{" "}
          <strong>{outcomes.jobsBooked}</strong> jobs · {booking}
        </p>
      </div>
      <ul className="shop-outcomes-meta">
        {outcomes.afterHoursLeads > 0 ? (
          <li>
            <strong>{outcomes.afterHoursLeads}</strong> after-hours leads captured
          </li>
        ) : null}
        {outcomes.emergenciesBooked > 0 ? (
          <li>
            <strong>{outcomes.emergenciesBooked}</strong> emergencies booked
          </li>
        ) : null}
        {outcomes.unassignedJobs > 0 ? (
          <li>
            <strong>{outcomes.unassignedJobs}</strong> jobs still need a tech
          </li>
        ) : null}
        {outcomes.jobsPerTech != null && outcomes.activeTechnicians > 0 ? (
          <li>
            <strong>{outcomes.jobsPerTech}</strong> jobs / tech
          </li>
        ) : null}
      </ul>
    </section>
  );
}
