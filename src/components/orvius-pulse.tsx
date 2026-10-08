"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAge, formatFreshness } from "@/lib/command-model";
import { displayPhone } from "@/lib/customer";
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
 * Orvius Pulse — the quiet system panel. Line health, alert delivery, and
 * how fresh this screen is. Problems here also appear as
 * one incident in the work queue; this panel states, it does not shout.
 */
export function OrviusPulse({
  health,
  lastUpdatedAt,
  stale,
  refreshing,
  onRetry,
  billingStatus,
  referenceImplementation,
  testMode,
}: {
  health: ShopHealth | null | undefined;
  lastUpdatedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  onRetry: () => void;
  billingStatus?: string | null;
  referenceImplementation?: boolean;
  testMode?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const failed = health?.failedAlerts24h ?? 0;
  const stuck = health?.stuckPendingAlerts ?? 0;
  const unreachable = Boolean(health && !health.alertsReachable && !referenceImplementation && !testMode);
  const pastDue = (billingStatus ?? "").toLowerCase() === "past_due";

  return (
    <section className="op-panel font-sans" aria-label="Orvius Pulse">
      <header className="op-head">
        <p className="op-title">System</p>
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
          {testMode ? (
            <PulseRow
              label="Phone line"
              value="Test mode"
              detail="Calls and texts are simulated. Your number is assigned when you go live."
              tone="attention"
              action={
                <Link href="/dashboard/onboarding?step=live" className="ox-btn ox-btn--quiet ox-btn--sm">
                  Go live
                </Link>
              }
            />
          ) : (
          <>
          <PulseRow
            label="Orvius line"
            value={health.line ? displayPhone(health.line) : referenceImplementation ? "Simulated" : "No line yet"}
            detail={
              !health.line
                ? referenceImplementation
                  ? "Demo calls run the real pipeline from the buttons on Command."
                  : "Calls cannot reach Orvius until a line exists."
                : health.lineVerified
                  ? health.lastCallAt
                    ? `Answers · last call ${formatAge(health.lastCallAt, now)} ago`
                    : "Answers when called"
                  : "Place one test call to verify."
            }
            tone={!health.line ? (referenceImplementation ? "attention" : "risk") : health.lineVerified ? "ok" : "attention"}
            action={
              !health.lineVerified ? (
                <Link href="/dashboard/onboarding" className="ox-btn ox-btn--quiet ox-btn--sm">
                  Test call
                </Link>
              ) : null
            }
          />
          {health.connection && health.line && !referenceImplementation ? (
            <PulseRow
              label="Your calls"
              value={health.connection.label}
              detail={health.connection.detail}
              tone={
                health.connection.state === "proven"
                  ? "ok"
                  : health.connection.state === "test_failed"
                    ? "risk"
                    : "attention"
              }
              action={
                health.connection.state !== "proven" ? (
                  <Link href="/dashboard?settings=phone" className="ox-btn ox-btn--quiet ox-btn--sm">
                    Test
                  </Link>
                ) : null
              }
            />
          ) : null}
          </>
          )}
          <PulseRow
            label="Alert delivery"
            value={
              testMode
                ? "Simulated"
                : unreachable
                ? "Nowhere to send"
                : failed > 0
                  ? `${failed} failed in 24h`
                  : stuck > 0
                    ? `${stuck} waiting to send`
                    : health.lastAlertAt
                      ? "Delivering"
                      : "No alerts sent yet"
            }
            detail={
              testMode
                ? "Alerts are written here, not sent. They reach your mobile once you go live."
                : unreachable
                ? "No text or email can reach you yet."
                : failed > 0
                  ? "Grouped as one incident in the work queue."
                  : health.lastAlertAt
                  ? `Last delivered ${formatAge(health.lastAlertAt, now)} ago${
                      health.alertLatencyP95Sec != null ? ` · 95% within ${health.alertLatencyP95Sec}s` : ""
                    }`
                  : null
            }
            tone={testMode ? "neutral" : unreachable || failed > 0 ? "risk" : stuck > 0 ? "attention" : health.lastAlertAt ? "ok" : "neutral"}
            action={
              unreachable ? (
                <Link href="/dashboard?settings=notifications" className="ox-btn ox-btn--quiet ox-btn--sm">
                  Fix
                </Link>
              ) : null
            }
          />
        </>
      )}

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
