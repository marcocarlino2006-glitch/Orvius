"use client";

import Link from "next/link";
import { company } from "@/lib/company";
import { formatCents } from "@/lib/money";
import type { CoverageState } from "@/lib/coverage-state";
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

export type ShopPulseNextAppt = {
  id: string;
  title: string;
  scheduledAt: string;
  customerName?: string | null;
} | null;

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
  unresolvedCount?: number;
  revenueAtRiskCents?: number | null;
  nextAppointment?: ShopPulseNextAppt;
};

/**
 * Quiet shop pulse — live-line health, coverage, next appointment, risk.
 * Never coaches the owner to look at a banner that no longer exists.
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
  unresolvedCount = 0,
  revenueAtRiskCents = null,
  nextAppointment = null,
}: ProLaunchControlProps) {
  const failedAlerts = health?.failedAlerts24h ?? 0;
  const stuckAlerts = health?.stuckPendingAlerts ?? 0;
  const atRisk =
    health?.status === "critical" || failedAlerts > 0 || stuckAlerts > 0;
  const setupReady = _wedge?.ready ?? false;
  const status = atRisk ? "critical" : setupReady ? "healthy" : "attention";
  const statusLabel = atRisk
    ? "Needs fix"
    : setupReady
      ? "Covered"
      : "Setup";
  const afterHours = Boolean(coverage?.afterHoursNow);
  const billing = (billingStatus ?? "none").toLowerCase();
  const needsPay =
    billing !== "active" &&
    (billing === "past_due" ||
      billing === "canceled" ||
      billing === "pilot" ||
      billing === "none");
  const showPayAction = needsPay && !atRisk;
  const payLabel =
    billing === "past_due"
      ? "Fix payment"
      : checkoutReady
        ? "Pay with card"
        : "Open billing";
  const risk = formatCents(revenueAtRiskCents);
  const lineLabel = health?.lineVerified
    ? "Live"
    : health?.dedicatedLine
      ? "Needs prove"
      : "Not set";
  const nextLabel = nextAppointment
    ? new Date(nextAppointment.scheduledAt).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "None scheduled";

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
          ? "Owner alerts need a fix — resolve it in the priority queue."
          : afterHours
            ? "After hours — the line is watching."
            : setupReady
              ? "Front door is covered."
              : "Finish setup so night calls land here."}
      </p>

      <dl className="pro-control-pulse pro-control-pulse--rich">
        <div>
          <dt className="font-sans">Live line</dt>
          <dd className="font-sans">
            <Link href="/dashboard/settings#overflow-forward">{lineLabel}</Link>
          </dd>
        </div>
        <div>
          <dt className="font-sans">After hours</dt>
          <dd className="font-sans">
            {afterHours ? "Covering now" : "In hours"}
            {(outcomes?.afterHoursLeads ?? 0) > 0
              ? ` · ${outcomes?.afterHoursLeads} caught`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="font-sans">Unresolved</dt>
          <dd className="font-sans">
            <a href="#attention-board">
              {unresolvedCount} lead{unresolvedCount === 1 ? "" : "s"}
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-sans">Next appt</dt>
          <dd className="font-sans">
            {nextAppointment ? (
              <Link href={`/dashboard/jobs/${nextAppointment.id}`}>
                {nextLabel}
                {nextAppointment.customerName
                  ? ` · ${nextAppointment.customerName}`
                  : ""}
              </Link>
            ) : (
              nextLabel
            )}
          </dd>
        </div>
        <div className="pro-control-pulse-span">
          <dt className="font-sans">Revenue at risk</dt>
          <dd className="font-sans">
            {risk ? (
              <a href="#attention-board">{risk}</a>
            ) : (
              "None measured"
            )}
          </dd>
        </div>
      </dl>

      {showPayAction ? (
        <Link href="/dashboard/billing" className="btn btn-void pro-control-action">
          {payLabel}
        </Link>
      ) : atRisk ? (
        <a href="#attention-board" className="btn btn-void pro-control-action">
          Fix alerts
        </a>
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
