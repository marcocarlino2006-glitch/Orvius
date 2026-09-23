"use client";

import Link from "next/link";
import {
  buildCommandBriefing,
  todayHasMeasuredActivity,
  type CommandToday,
} from "@/lib/command-today";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProCommandOutcomesProps = {
  today: CommandToday | null | undefined;
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  loading?: boolean;
  lineVerified?: boolean;
  line?: string | null;
  setupReady?: boolean;
};

/**
 * First viewport — concise AI briefing, then only high-signal chips.
 * Never lets a wall of zeros dominate an idle shop.
 */
export function ProCommandOutcomes({
  today,
  outcomes,
  attentionCount,
  loading = false,
  lineVerified = false,
  line = null,
  setupReady = false,
}: ProCommandOutcomesProps) {
  const hasActivity = today ? todayHasMeasuredActivity(today) : false;
  const briefing = today
    ? buildCommandBriefing(today, attentionCount)
    : null;
  const idle = !loading && today && !hasActivity;

  return (
    <section
      className={`pro-command-outcomes pro-command-outcomes--today${
        idle ? " pro-command-outcomes--idle" : ""
      }`}
      aria-label="Today’s briefing"
    >
      <header className="pro-command-outcomes-head font-sans">
        <p className="pro-command-outcomes-kicker">Briefing</p>
        <span>
          {today?.since
            ? `Since ${new Date(today.since).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })} · measured shop records`
            : "Measured shop records"}
        </span>
      </header>

      {loading || !briefing ? (
        <div className="pro-command-outcomes-summary font-sans">
          <span className="pro-command-outcomes-wait" aria-hidden />
        </div>
      ) : idle ? (
        <div className="pro-command-empty font-sans">
          <h2 className="pro-command-empty-title">Line is quiet</h2>
          <p className="pro-command-empty-body">
            {lineVerified || setupReady
              ? "No calls yet today. When the phone rings, Orvius will answer, qualify, book, alert you, and follow up — every call, customer, job, estimate, and payment lands here with a timestamp."
              : "Activate your live line so Orvius can answer after hours. Once calls arrive, this briefing will show answered calls, qualified leads, booked appointments, and estimated revenue — all clickable back to the record."}
          </p>
          <div className="pro-command-empty-actions">
            {!lineVerified ? (
              <Link
                href="/dashboard/settings#overflow-forward"
                className="btn btn-void text-sm"
              >
                {line ? "Prove the line" : "Activate live line"}
              </Link>
            ) : null}
            {attentionCount > 0 ? (
              <a href="#attention-board" className="pro-command-empty-link">
                {attentionCount} item{attentionCount === 1 ? "" : "s"} need you →
              </a>
            ) : (
              <p className="pro-command-empty-meta">
                Board is clear — nothing waiting
                {outcomes
                  ? ` · Last ${outcomes.windowDays}d: ${outcomes.jobsBooked} booked`
                  : ""}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="pro-command-briefing font-sans">{briefing.sentence}</p>
          {briefing.metrics.length > 0 ? (
            <ul className="pro-command-briefing-metrics font-sans">
              {briefing.metrics.map((metric) => (
                <li key={metric.id}>
                  <Link
                    href={metric.href}
                    className={`pro-command-metric${
                      metric.tone === "attention"
                        ? " pro-command-metric--attention"
                        : ""
                    }`}
                  >
                    <span className="pro-command-metric-value">
                      {metric.value}
                    </span>
                    <span className="pro-command-metric-label">
                      {metric.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <footer className="pro-command-outcomes-foot font-sans">
            <p>
              Every figure traces to a call, customer, job, or payment
              {outcomes
                ? ` · Last ${outcomes.windowDays}d: ${outcomes.jobsBooked} booked`
                : ""}
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
