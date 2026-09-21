"use client";

import Link from "next/link";
import { company } from "@/lib/company";
import type { CoverageState } from "@/lib/coverage-state";
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProLaunchControlProps = {
  wedge?: WedgeReadiness | null;
  events: ShiftEvent[];
  moneyEnabled: boolean;
  checkoutReady: boolean;
  billingStatus?: string | null;
  referenceImplementation?: boolean;
  coverage?: CoverageState | null;
  health?: ShopHealth | null;
  outcomes?: ShopOutcomes | null;
};

/**
 * Quiet shop pulse. Banner above owns the red gate — this rail never coaches
 * the owner to look elsewhere, never scoreboards the loop.
 */
export function ProLaunchControl({
  wedge: _wedge,
  events: _events,
  moneyEnabled: _moneyEnabled,
  checkoutReady,
  billingStatus,
  referenceImplementation = false,
  coverage,
  health,
  outcomes,
}: ProLaunchControlProps) {
  const failedAlerts = health?.failedAlerts24h ?? 0;
  const stuckAlerts = health?.stuckPendingAlerts ?? 0;
  const atRisk =
    health?.status === "critical" || failedAlerts > 0 || stuckAlerts > 0;
  const setupReady = _wedge?.ready ?? false;
  const status = atRisk ? "critical" : setupReady ? "healthy" : "attention";
  const statusLabel = atRisk
    ? "Coverage risk"
    : setupReady
      ? "Covered"
      : "Setup";
  const caught = outcomes?.afterHoursLeads ?? 0;
  const booked = outcomes?.afterHoursBooked ?? 0;
  const billing = (billingStatus ?? "none").toLowerCase();
  const needsPay =
    billing !== "active" &&
    (billing === "past_due" ||
      billing === "canceled" ||
      billing === "pilot" ||
      billing === "none");
  const showPayAction = needsPay && !atRisk;
  const showPrimaryAction = false;
  const payLabel =
    billing === "past_due"
      ? "Fix payment"
      : checkoutReady
        ? "Pay with card"
        : "Open billing";

  return (
    <section className="pro-rail-card pro-launch-control pro-control-center">
      <div className="pro-rail-card-head">
        <p className="pro-rail-card-title font-sans">Shop pulse</p>
        <span className={`pro-rail-status pro-rail-status-${status}`}>
          {statusLabel}
        </span>
      </div>

      <p className="pro-control-lead font-sans">
        {atRisk
          ? "Owner alerts need a fix — use the banner above (Send test alert)."
          : showPayAction
            ? billing === "past_due"
              ? "Payment failed — fix the card so the line stays live."
              : "Card not on file yet."
            : coverage?.afterHoursNow
              ? "After hours — the line is watching."
              : setupReady
                ? "Line is watching."
                : "Setup still open — banner above owns the next move."}
      </p>

      <dl className="pro-control-pulse">
        <div>
          <dt className="font-sans">Line</dt>
          <dd className="font-sans">
            {health?.lineVerified ? "Verified" : "Needs test"}
          </dd>
        </div>
        <div>
          <dt className="font-sans">After hours</dt>
          <dd className="font-sans">
            {caught} caught · {booked} booked
          </dd>
        </div>
      </dl>

      {showPayAction ? (
        <Link href="/dashboard/billing" className="btn btn-void pro-control-action">
          {payLabel}
        </Link>
      ) : showPrimaryAction ? (
        <Link href="/dashboard" className="btn btn-void pro-control-action">
          Open Command
        </Link>
      ) : null}

      {referenceImplementation ? (
        <p className="pro-launch-disclosure font-sans">
          Reference environment. Activity is illustrative, not customer results.
        </p>
      ) : null}

      <div className="pro-rail-card-foot font-sans">
        <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
        <Link href="/dashboard/settings">Settings →</Link>
      </div>
    </section>
  );
}
