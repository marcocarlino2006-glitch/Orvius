"use client";

import Link from "next/link";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

export type CoverageState = {
  afterHoursNow: boolean;
  timezone: string | null;
  forwardConfirmed: boolean;
};

/**
 * Night watch — the wedge in one card: is the shop in its after-hours window
 * right now, and how much of that window turned into work last week.
 */
export function ProNightWatch({
  coverage,
  outcomes,
}: {
  coverage: CoverageState | null | undefined;
  outcomes: ShopOutcomes | null | undefined;
}) {
  if (!coverage || !outcomes) return null;

  const caught = outcomes.afterHoursLeads;
  const booked = outcomes.afterHoursBooked;
  const share = caught > 0 ? Math.round((booked / caught) * 100) : null;

  return (
    <section className="pro-rail-card pro-night-watch">
      <div className="pro-rail-card-head">
        <p className="pro-rail-card-title font-sans">Night watch</p>
        <span
          className={`pro-rail-status ${
            coverage.afterHoursNow ? "pro-rail-status-night" : "pro-rail-status-healthy"
          }`}
        >
          {coverage.afterHoursNow ? "After hours" : "Open"}
        </span>
      </div>

      <p className="pro-night-watch-state font-sans">
        {coverage.afterHoursNow
          ? "Your line is on watch. Calls get answered, qualified, and sent to you."
          : "Shop hours. Calls you miss or leave busy roll to the line if forwarding is on."}
      </p>

      <dl className="pro-night-watch-stats">
        <div>
          <dt className="font-sans">Caught after hours</dt>
          <dd className="font-sans">{caught}</dd>
        </div>
        <div>
          <dt className="font-sans">Booked from those</dt>
          <dd className="font-sans">{booked}</dd>
        </div>
      </dl>

      <div className="pro-rail-card-foot font-sans">
        <span>
          {share != null
            ? `${share}% booked · last ${outcomes.windowDays} days`
            : `Last ${outcomes.windowDays} days`}
        </span>
        <Link href="/dashboard/calls" className="pro-section-link">
          Calls →
        </Link>
      </div>

      {!coverage.forwardConfirmed ? (
        <p className="pro-night-watch-warn font-sans">
          Forwarding not confirmed — missed calls may still hit voicemail.
        </p>
      ) : null}
    </section>
  );
}
