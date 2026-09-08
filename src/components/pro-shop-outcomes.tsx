"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProShopOutcomesProps = {
  outcomes: ShopOutcomes | null | undefined;
  loading?: boolean;
};

export function ProShopOutcomes({ outcomes, loading }: ProShopOutcomesProps) {
  if (loading && !outcomes) {
    return (
      <section
        className="shop-outcomes shop-outcomes-loading font-sans"
        aria-label="Shop outcomes"
        aria-busy="true"
      >
        <p className="shop-outcomes-kicker type-eyebrow">Last 7 days</p>
        <div className="shop-outcomes-skel" aria-hidden>
          <span className="skeleton attention-skel-line attention-skel-line-lg" />
          <span className="skeleton attention-skel-line attention-skel-line-md" />
        </div>
      </section>
    );
  }

  if (!outcomes) return null;

  const capturedValue = formatCents(
    outcomes.capturedDemandEstimatedValueCents,
  );
  const pipeline = formatCents(outcomes.estimatedPipelineCents);
  const collected = formatCents(outcomes.collectedCents);
  const jobsDelta = outcomes.jobsPerWeekVsBaseline;

  // Headline numbers read as a stat row; the notes below carry the nuance.
  const stats: Array<{ label: string; value: string }> = [
    { label: "Calls", value: String(outcomes.calls) },
    { label: "Leads", value: String(outcomes.leads) },
    { label: "Jobs booked", value: String(outcomes.jobsBooked) },
    {
      label: "Booking rate",
      value: outcomes.bookingRate != null ? `${outcomes.bookingRate}%` : "—",
    },
  ];

  if (pipeline) {
    stats.push({ label: "Est. pipeline", value: pipeline });
  }

  if (collected && outcomes.collectedCents > 0) {
    stats.push({ label: "Collected", value: collected });
  }

  return (
    <section className="shop-outcomes font-sans" aria-label="Shop outcomes">
      <div className="shop-outcomes-head">
        <p className="shop-outcomes-kicker type-eyebrow">
          Last {outcomes.windowDays} days · economics
        </p>
      </div>
      <dl className="shop-outcomes-stats">
        {stats.map((stat) => (
          <div className="shop-outcome-stat" key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
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
        {outcomes.capturedDemandJobs > 0 ? (
          <li>
            <strong>{outcomes.capturedDemandJobs}</strong>{" "}
            {outcomes.capturedDemandJobs === 1 ? "job" : "jobs"} booked from
            captured calls/texts
            {capturedValue ? ` · ${capturedValue} est. at avg ticket` : ""}
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
            {" · owner-reported context, not attribution"}
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
            to estimate captured-demand value
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
