"use client";

import Link from "next/link";
import { ProLead } from "@/components/pro-lead";
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
  const caption = capturedValue
    ? "estimated booked value from Orvius"
    : capturedJobs === 1
      ? "job booked from Orvius-captured demand"
      : "jobs booked from Orvius-captured demand";

  const detail = outcomes
    ? `${outcomes.calls} captured ${
        outcomes.calls === 1 ? "call" : "calls"
      } became ${outcomes.leads} ${
        outcomes.leads === 1 ? "lead" : "leads"
      } and ${outcomes.jobsBooked} booked ${
        outcomes.jobsBooked === 1 ? "job" : "jobs"
      } in the last ${outcomes.windowDays} days.`
    : "Measured calls, leads, bookings, and value will appear here.";

  return (
    <section
      className="pro-command-outcomes"
      aria-label="Work completed by Orvius"
    >
      <p className="pro-command-outcomes-kicker font-sans">
        Orvius ran the front desk
      </p>
      <ProLead
        figure={figure}
        caption={caption}
        detail={detail}
        loading={loading}
        facts={
          loading
            ? undefined
            : [
                {
                  label:
                    attentionCount === 1
                      ? "exception needs you"
                      : "exceptions need you",
                  value: attentionCount,
                  live: attentionCount > 0,
                },
                ...(outcomes?.afterHoursBooked
                  ? [
                      {
                        label: "booked after hours",
                        value: outcomes.afterHoursBooked,
                      },
                    ]
                  : []),
              ]
        }
        action={
          !loading && attentionCount > 0 ? (
            <a href="#attention-board" className="btn btn-void text-sm">
              Work the exceptions
            </a>
          ) : !loading ? (
            <Link href="/dashboard/calls" className="btn btn-secondary text-sm">
              Review captured calls
            </Link>
          ) : null
        }
      />
    </section>
  );
}
