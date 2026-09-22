"use client";

import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProCommandOutcomesProps = {
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  loading?: boolean;
};

/**
 * Call → cash pulse — one story when the board is clear.
 * Stripe-quiet: a single chain, not a marketing metric grid.
 */
export function ProCommandOutcomes({
  outcomes,
  attentionCount,
  loading = false,
}: ProCommandOutcomesProps) {
  if (!loading && attentionCount > 0) return null;

  const calls = loading ? "…" : String(outcomes?.calls ?? 0);
  const leads = loading ? "…" : String(outcomes?.leads ?? 0);
  const booked = loading ? "…" : String(outcomes?.jobsBooked ?? 0);
  const afterHours = loading ? "…" : String(outcomes?.afterHoursBooked ?? 0);
  const collected = formatCents(outcomes?.collectedCents);
  const influenced =
    formatCents(outcomes?.capturedDemandEstimatedValueCents) ?? collected;
  const moneyLabel = collected
    ? "Collected"
    : influenced
      ? "Influenced"
      : "Money";
  const moneyValue = loading ? "…" : (collected ?? influenced ?? "—");
  const moneyHint = loading
    ? null
    : collected
      ? null
      : influenced
        ? "Estimated from avg ticket × captured jobs"
        : "Set average ticket in Settings to estimate";

  const steps = [
    { label: "Calls", value: calls },
    { label: "Leads", value: leads },
    { label: "Booked", value: booked },
    { label: "After-hours", value: afterHours },
    { label: moneyLabel, value: moneyValue, hint: moneyHint },
  ] as const;

  const bookingRate =
    outcomes?.bookingRate != null
      ? `${Math.round(outcomes.bookingRate * 100)}%`
      : null;

  return (
    <section
      className="pro-command-outcomes"
      aria-label="Call to cash outcomes"
    >
      <header className="pro-command-outcomes-head font-sans">
        <p className="pro-command-outcomes-kicker">Call → cash</p>
        <span>Last {outcomes?.windowDays ?? 7} days</span>
      </header>

      <ol className="pro-command-pulse font-sans">
        {steps.map((step, i) => (
          <li key={step.label} className="pro-command-pulse-step">
            {i > 0 ? (
              <span className="pro-command-pulse-sep" aria-hidden>
                →
              </span>
            ) : null}
            <div className="pro-command-pulse-body">
              <p className="pro-command-pulse-label">{step.label}</p>
              <p className="pro-command-pulse-value">{step.value}</p>
              {"hint" in step && step.hint ? (
                <p className="pro-command-pulse-hint">{step.hint}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {!loading && outcomes ? (
        <p className="pro-command-pulse-meta font-sans">
          {bookingRate ? (
            <>
              Lead → book <strong>{bookingRate}</strong>
              <span aria-hidden> · </span>
            </>
          ) : null}
          Open invoices{" "}
          <strong>{formatCents(outcomes.openInvoiceCents) ?? "—"}</strong>
          <span aria-hidden> · </span>
          Open estimates{" "}
          <strong>{formatCents(outcomes.openEstimateCents) ?? "—"}</strong>
        </p>
      ) : null}

      {!loading ? (
        <footer className="pro-command-outcomes-foot font-sans">
          <p>Board is clear — line watched the window above.</p>
        </footer>
      ) : null}
    </section>
  );
}
