"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProCommandOutcomesProps = {
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  loading?: boolean;
};

/**
 * The answer to "what did Orvius do for me?" before the owner sees a queue.
 *
 * Every figure is measured from shop records. Captured-demand value only
 * appears when the owner supplied an average ticket; otherwise the measured
 * job count leads rather than inventing a dollar claim.
 */
export function ProCommandOutcomes({
  outcomes,
  attentionCount,
  loading = false,
}: ProCommandOutcomesProps) {
  const capturedJobs = outcomes?.capturedDemandJobs ?? 0;
  const capturedValue = formatCents(
    outcomes?.capturedDemandEstimatedValueCents,
  );
  const figure = capturedValue ?? String(capturedJobs);
  const metricLabel = capturedValue
    ? "Estimated booked value"
    : capturedJobs === 1
      ? "Job booked from captured demand"
      : "Jobs booked from captured demand";

  return (
    <section
      className="pro-command-outcomes"
      aria-label="Work completed by Orvius"
    >
      <header className="pro-command-outcomes-head font-sans">
        <p className="pro-command-outcomes-kicker">Front desk performance</p>
        <span>
          Last {outcomes?.windowDays ?? 7} days
        </span>
      </header>

      <div className="pro-command-outcomes-summary font-sans">
        {loading ? (
          <span className="pro-command-outcomes-wait" aria-hidden />
        ) : (
          <>
            <p className="pro-command-outcomes-figure">{figure}</p>
            <h2>{metricLabel}</h2>
          </>
        )}
      </div>

      {!loading && outcomes ? (
        <dl className="pro-command-flow font-sans">
          <div>
            <dt>Calls captured</dt>
            <dd>{outcomes.calls}</dd>
          </div>
          <div>
            <dt>Qualified leads</dt>
            <dd>{outcomes.leads}</dd>
          </div>
          <div>
            <dt>Jobs booked</dt>
            <dd>{outcomes.jobsBooked}</dd>
          </div>
          <div>
            <dt>After hours</dt>
            <dd>{outcomes.afterHoursBooked}</dd>
          </div>
        </dl>
      ) : null}

      {!loading ? (
        <footer className="pro-command-outcomes-foot font-sans">
          <p>
            {attentionCount > 0
              ? `${attentionCount} ${
                  attentionCount === 1 ? "exception requires" : "exceptions require"
                } review`
              : "No exceptions require review"}
          </p>
          {attentionCount > 0 ? (
            <a href="#attention-board" className="btn btn-void text-sm">
              Review {attentionCount} exceptions
            </a>
          ) : (
            <Link href="/dashboard/calls">Review calls</Link>
          )}
        </footer>
      ) : null}
    </section>
  );
}
