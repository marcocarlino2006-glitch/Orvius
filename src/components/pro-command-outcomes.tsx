"use client";

import { formatCents, formatCentsExact } from "@/lib/money";
import type { CommandToday } from "@/lib/command-today";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProCommandOutcomesProps = {
  today: CommandToday | null | undefined;
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  loading?: boolean;
};

/**
 * High-signal Command home — what Orvius did TODAY.
 * Never hides when the board is busy; the queue sits under this strip.
 */
export function ProCommandOutcomes({
  today,
  outcomes,
  attentionCount,
  loading = false,
}: ProCommandOutcomesProps) {
  const estimated = formatCents(today?.estimatedJobValueCents);
  const collected =
    today && today.collectedCents > 0
      ? formatCentsExact(today.collectedCents)
      : null;

  const cells = [
    {
      label: "Calls answered",
      value: String(today?.callsAnswered ?? 0),
    },
    {
      label: "Missed recovered",
      value: String(today?.missedRecovered ?? 0),
      hint: "After-hours leads booked today",
    },
    {
      label: "Qualified leads",
      value: String(today?.qualifiedLeads ?? 0),
    },
    {
      label: "Appointments booked",
      value: String(today?.appointmentsBooked ?? 0),
    },
    {
      label: "Urgent open",
      value: String(today?.urgentOpen ?? 0),
    },
    {
      label: "Unresolved",
      value: String(today?.unresolved ?? attentionCount),
    },
  ];

  return (
    <section
      className="pro-command-outcomes pro-command-outcomes--today"
      aria-label="What Orvius did today"
    >
      <header className="pro-command-outcomes-head font-sans">
        <p className="pro-command-outcomes-kicker">Today</p>
        <span>Since midnight · measured shop records</span>
      </header>

      <div className="pro-command-outcomes-summary font-sans">
        {loading ? (
          <span className="pro-command-outcomes-wait" aria-hidden />
        ) : (
          <>
            <p className="pro-command-outcomes-figure">
              {estimated ?? collected ?? String(today?.appointmentsBooked ?? 0)}
            </p>
            <h2>
              {estimated
                ? "Estimated job value booked today"
                : collected
                  ? "Collected today (recorded payments)"
                  : (today?.appointmentsBooked ?? 0) === 1
                    ? "Appointment booked today"
                    : "Appointments booked today"}
            </h2>
            {!estimated && !today?.avgTicketCents ? (
              <p className="pro-command-outcomes-hint">
                Set average ticket in Settings to estimate booked value.
              </p>
            ) : null}
          </>
        )}
      </div>

      {!loading ? (
        <dl className="pro-command-flow pro-command-flow--today font-sans">
          {cells.map((cell) => (
            <div key={cell.label} title={cell.hint}>
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!loading ? (
        <footer className="pro-command-outcomes-foot font-sans">
          <p>
            {attentionCount > 0
              ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need you below`
              : "Board is clear — nothing waiting"}
            {outcomes
              ? ` · Last ${outcomes.windowDays}d: ${outcomes.jobsBooked} booked`
              : ""}
          </p>
        </footer>
      ) : null}
    </section>
  );
}
