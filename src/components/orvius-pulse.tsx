"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAge, formatFreshness } from "@/lib/command-model";
import { displayPhone } from "@/lib/customer";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { ShopHealth } from "@/lib/shop-health";

type Tone = "ok" | "attention" | "risk" | "neutral";

function PulseRow({
  label,
  value,
  detail,
  tone,
  action,
}: {
  label: string;
  value: string;
  detail?: string | null;
  tone: Tone;
  action?: React.ReactNode;
}) {
  return (
    <div className={`op-row op-tone--${tone}`}>
      <span className="op-dot" aria-hidden />
      <div className="op-row-copy">
        <p className="op-row-label">{label}</p>
        <p className="op-row-value">{value}</p>
        {detail ? <p className="op-row-detail">{detail}</p> : null}
      </div>
      {action ? <div className="op-row-action">{action}</div> : null}
    </div>
  );
}

/**
 * Orvius Pulse — the quiet system panel. Line health, alert delivery, recent
 * proven events, and how fresh this screen is. Problems here also appear as
 * one incident in the work queue; this panel states, it does not shout.
 */
export function OrviusPulse({
  health,
  events,
  lastUpdatedAt,
  stale,
  refreshing,
  onRetry,
  billingStatus,
  referenceImplementation,
}: {
  health: ShopHealth | null | undefined;
  events: ShiftEvent[];
  lastUpdatedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  onRetry: () => void;
  billingStatus?: string | null;
  referenceImplementation?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const failed = health?.failedAlerts24h ?? 0;
  const stuck = health?.stuckPendingAlerts ?? 0;
  const recent = events.filter((e) => e.tone === "success" || e.tone === "agent").slice(0, 3);
  const pastDue = (billingStatus ?? "").toLowerCase() === "past_due";

  return (
    <section className="op-panel font-sans" aria-label="Orvius Pulse">
      <header className="op-head">
        <p className="op-title">Orvius Pulse</p>
        <span className={`op-fresh ${stale ? "is-stale" : ""}`}>
          {stale ? "Stale" : formatFreshness(lastUpdatedAt, now)}
        </span>
      </header>

      {!health ? (
        <div className="op-skel" aria-busy="true">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ) : (
        <>
          <PulseRow
            label="Phone line"
            value={health.line ? displayPhone(health.line) : "No line yet"}
            detail={
              !health.line
                ? "Calls cannot reach Orvius until a line exists."
                : health.lineVerified
                  ? health.lastCallAt
                    ? `Verified · last call ${formatAge(health.lastCallAt, now)} ago`
                    : "Verified"
                  : "Place one test call to verify."
            }
            tone={!health.line ? "risk" : health.lineVerified ? "ok" : "attention"}
            action={
              !health.lineVerified ? (
                <Link href="/dashboard/onboarding" className="ox-btn ox-btn--quiet ox-btn--sm">
                  Test call
                </Link>
              ) : null
            }
          />
          <PulseRow
            label="Alert delivery"
            value={
              failed > 0
                ? `${failed} failed in 24h`
                : stuck > 0
                  ? `${stuck} waiting to send`
                  : health.lastAlertAt
                    ? "Delivering"
                    : "No alerts sent yet"
            }
            detail={
              failed > 0
                ? "Grouped as one incident in the work queue."
                : health.lastAlertAt
                  ? `Last delivered ${formatAge(health.lastAlertAt, now)} ago`
                  : null
            }
            tone={failed > 0 ? "risk" : stuck > 0 ? "attention" : health.lastAlertAt ? "ok" : "neutral"}
          />
        </>
      )}

      <div className="op-recent">
        <p className="op-row-label">Recent successful events</p>
        {recent.length ? (
          <ul>
            {recent.map((event) => (
              <li key={event.key}>
                {event.href ? (
                  <Link href={event.href} className="op-event">
                    <span>{event.title}</span>
                    <span className="op-event-age">{formatAge(event.at, now)}</span>
                  </Link>
                ) : (
                  <span className="op-event">
                    <span>{event.title}</span>
                    <span className="op-event-age">{formatAge(event.at, now)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="op-row-detail">Nothing proven in the last 24 hours.</p>
        )}
      </div>

      {stale ? (
        <div className="op-stale" role="status">
          <p>Live refresh paused. Everything above is from the last successful update.</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={refreshing} onClick={onRetry}>
            {refreshing ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}

      {pastDue ? (
        <Link href="/dashboard/billing" className="ox-btn ox-btn--primary ox-btn--block">
          Fix payment
        </Link>
      ) : null}

      {referenceImplementation ? (
        <p className="op-disclosure">Reference environment — activity is illustrative, not customer results.</p>
      ) : null}
    </section>
  );
}
