"use client";

import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProCommandOutcomesProps = {
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  loading?: boolean;
};

/**
 * Call → cash pulse for the owner.
 * Main question: demand captured → completed work → money produced.
 * Dollars only when measured (avg ticket / payments) — never invented GP.
 */
export function ProCommandOutcomes({
  outcomes,
  attentionCount,
  loading = false,
}: ProCommandOutcomesProps) {
  if (!loading && attentionCount > 0) return null;

  const revenueInfluenced =
    formatCents(outcomes?.capturedDemandEstimatedValueCents) ??
    formatCents(outcomes?.collectedCents);
  const unpaid = formatCents(outcomes?.openInvoiceCents) ?? "—";
  const collected = formatCents(outcomes?.collectedCents);

  const cards = [
    {
      label: "Calls captured",
      value: loading ? "…" : String(outcomes?.calls ?? 0),
    },
    {
      label: "Qualified leads",
      value: loading ? "…" : String(outcomes?.leads ?? 0),
    },
    {
      label: "Appointments booked",
      value: loading ? "…" : String(outcomes?.jobsBooked ?? 0),
    },
    {
      label: "Jobs from captured demand",
      value: loading ? "…" : String(outcomes?.capturedDemandJobs ?? 0),
    },
    {
      label: "Revenue influenced",
      value: loading ? "…" : (revenueInfluenced ?? "—"),
      hint: !revenueInfluenced
        ? "Set average ticket in Settings to estimate"
        : collected
          ? `Collected ${collected}`
          : "Estimated from avg ticket × captured jobs",
    },
    {
      label: "Unpaid invoices",
      value: loading ? "…" : unpaid,
    },
  ] as const;

  return (
    <section
      className="pro-command-outcomes"
      aria-label="Call to cash outcomes"
    >
      <header className="pro-command-outcomes-head font-sans">
        <p className="pro-command-outcomes-kicker">Call → cash</p>
        <span>Last {outcomes?.windowDays ?? 7} days</span>
      </header>

      <p className="pro-command-outcomes-question font-sans">
        How much demand did Orvius capture, how much became completed work, and
        how much money did that work produce?
      </p>

      <div className="pro-command-cash-grid font-sans">
        {cards.map((card) => (
          <div key={card.label} className="pro-command-cash-card">
            <p className="pro-command-cash-label">{card.label}</p>
            <p className="pro-command-cash-value">{card.value}</p>
            {"hint" in card && card.hint ? (
              <p className="pro-command-cash-hint">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      {!loading && outcomes ? (
        <dl className="pro-command-flow font-sans">
          <div>
            <dt>After-hours booked</dt>
            <dd>{outcomes.afterHoursBooked}</dd>
          </div>
          <div>
            <dt>Lead → book</dt>
            <dd>
              {outcomes.bookingRate != null
                ? `${Math.round(outcomes.bookingRate * 100)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Open estimates</dt>
            <dd>{formatCents(outcomes.openEstimateCents) ?? "—"}</dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>{formatCents(outcomes.collectedCents) ?? "—"}</dd>
          </div>
        </dl>
      ) : null}

      {!loading ? (
        <footer className="pro-command-outcomes-foot font-sans">
          <p>Board is clear — line watched the window above.</p>
        </footer>
      ) : null}
    </section>
  );
}
