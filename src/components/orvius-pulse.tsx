"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAge, formatFreshness } from "@/lib/command-model";
import { displayPhone } from "@/lib/customer";
import { shopReadiness, type ReadinessMark, type ReadinessRow } from "@/lib/readiness";
import type { ShopHealth } from "@/lib/shop-health";
import { TestAlertButton } from "@/components/test-alert-button";

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

const STAGES: Array<[keyof Pick<ReadinessRow, "configured" | "verified" | "healthy">, string]> = [
  ["configured", "Set up"],
  ["verified", "Verified"],
  ["healthy", "Healthy now"],
];

function markClass(mark: ReadinessMark) {
  return mark.ok === true ? "is-yes" : mark.ok === false ? "is-no" : "is-unknown";
}

function ReadinessPulseRow({ row, action }: { row: ReadinessRow; action: React.ReactNode }) {
  return (
    <div className={`op-row op-tone--${row.tone}`}>
      <span className="op-dot" aria-hidden />
      <div className="op-row-copy">
        <p className="op-row-label">{row.label}</p>
        <p className="op-row-value">{row.summary}</p>
        <dl className="op-stages">
          {STAGES.map(([key, label]) => (
            <div key={key} className={`op-stage ${markClass(row[key])}`}>
              <dt>{label}</dt>
              <dd>
                <span className="sr-only">{row[key].ok === true ? "Yes: " : row[key].ok === false ? "No: " : "Unknown: "}</span>
                {row[key].text}
              </dd>
            </div>
          ))}
        </dl>
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

  const readiness = health
    ? shopReadiness(
        {
          ...health,
          alertsReachable: health.alertsReachable || Boolean(referenceImplementation),
        },
        now,
      ).filter((row) => row.id !== "forwarding" || (health.line && !referenceImplementation))
    : [];
  const actionFor = (row: ReadinessRow) =>
    row.action === "test_call" ? (
      <Link href="/dashboard/onboarding" className="ox-btn ox-btn--quiet ox-btn--sm">
        Test call
      </Link>
    ) : row.action === "forward_test" ? (
      <Link href="/dashboard?settings=phone" className="ox-btn ox-btn--quiet ox-btn--sm">
        Test
      </Link>
    ) : row.action === "fix_alerts" ? (
      <Link href="/dashboard?settings=notifications" className="ox-btn ox-btn--quiet ox-btn--sm">
        Fix
      </Link>
    ) : row.action === "test_alert" ? (
      <TestAlertButton />
    ) : null;
  const pastDue = (billingStatus ?? "").toLowerCase() === "past_due";

  return (
    <section className="op-panel font-sans" aria-label="Orvius Pulse">
      <header className="op-head">
        <p className="op-title">System</p>
        <span className={`op-fresh ${stale ? "is-stale" : ""}`}>
          {stale ? (
            "Stale"
          ) : (
            <>
              Live · {formatFreshness(lastUpdatedAt, now)} ·{" "}
              <span className="op-live-clock">
                {new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </>
          )}
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
            readiness.map((row) =>
              row.id === "line" && referenceImplementation && !health.line ? (
                <PulseRow
                  key={row.id}
                  label="Orvius number"
                  value="Simulated"
                  detail="Demo calls run the real pipeline from the buttons on Command."
                  tone="attention"
                />
              ) : (
                <ReadinessPulseRow key={row.id} row={row} action={actionFor(row)} />
              ),
            )
          )}
          {testMode ? (
            <PulseRow
              label="Alert delivery"
              value="Simulated"
              detail="Alerts are written here, not sent. They reach your mobile once you go live."
              tone="neutral"
            />
          ) : null}
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
