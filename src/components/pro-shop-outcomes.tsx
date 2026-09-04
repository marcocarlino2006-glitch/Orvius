"use client";

import Link from "next/link";
import { formatCents, formatCentsDelta } from "@/lib/money";
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
  const recovered = formatCents(outcomes.recoveredRevenueCents);
  const pipeline = formatCents(outcomes.estimatedPipelineCents);
  const collected = formatCents(outcomes.collectedCents);
  const jobsDelta = outcomes.jobsPerWeekVsBaseline;

  return (
    <section className="shop-outcomes font-sans" aria-label="Shop outcomes">
      <div className="shop-outcomes-head">
        <p className="shop-outcomes-kicker type-eyebrow">
          Last {outcomes.windowDays} days · economics
        </p>
        <p className="shop-outcomes-line">
          <strong>{outcomes.calls}</strong> calls ·{" "}
          <strong>{outcomes.leads}</strong> leads ·{" "}
          <strong>{outcomes.jobsBooked}</strong> jobs · {booking}
          {recovered ? (
            <>
              {" "}
              · <strong>{recovered}</strong> est. recovered
            </>
          ) : pipeline ? (
            <>
              {" "}
              · <strong>{pipeline}</strong> est. pipeline
            </>
          ) : null}
          {collected && outcomes.collectedCents > 0 ? (
            <>
              {" "}
              · <strong>{collected}</strong> collected
            </>
          ) : null}
        </p>
      </div>
      <ul className="shop-outcomes-meta">
        {outcomes.afterHoursLeads > 0 ? (
          <li>
            <strong>{outcomes.afterHoursLeads}</strong> after-hours leads ·{" "}
            <strong>{outcomes.afterHoursBooked}</strong> booked
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
        {jobsDelta != null ? (
          <li>
            Jobs/week vs before Orvius:{" "}
            <strong>
              {jobsDelta > 0 ? "+" : ""}
              {jobsDelta}
            </strong>
            {outcomes.recoveredRevenueCents != null
              ? ` · ${formatCentsDelta(outcomes.recoveredRevenueCents)} est.`
              : ""}
          </li>
        ) : null}
        {outcomes.openEstimateCents > 0 || outcomes.openInvoiceCents > 0 ? (
          <li>
            Open estimates {formatCents(outcomes.openEstimateCents) ?? "$0"} · open
            invoices {formatCents(outcomes.openInvoiceCents) ?? "$0"}
          </li>
        ) : null}
        {!outcomes.avgTicketCents ? (
          <li>
            <Link href="/dashboard/settings" className="pro-section-link">
              Set avg ticket →
            </Link>{" "}
            to estimate recovered revenue
          </li>
        ) : null}
        {!outcomes.economicsReady ? (
          <li>
            <Link href="/dashboard/settings" className="pro-section-link">
              Set before-Orvius baseline →
            </Link>{" "}
            for measured lift (jobs/week + missed calls)
          </li>
        ) : null}
      </ul>
    </section>
  );
}
