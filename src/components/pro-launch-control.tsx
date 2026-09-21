"use client";

import Link from "next/link";
import { company } from "@/lib/company";
import { buildPipelineProof } from "@/lib/pipeline-proof";
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

export function ProLaunchControl({
  wedge,
  events,
  moneyEnabled,
  checkoutReady,
  billingStatus,
  referenceImplementation = false,
  coverage,
  health,
  outcomes,
}: ProLaunchControlProps) {
  const proof = buildPipelineProof(events, moneyEnabled);
  const proven = proof.filter((stage) => stage.state === "proven").length;
  const setupDone = wedge?.score ?? 0;
  const setupTotal = wedge?.total ?? 0;
  const failedAlerts = health?.failedAlerts24h ?? 0;
  const stuckAlerts = health?.stuckPendingAlerts ?? 0;
  const atRisk =
    health?.status === "critical" || failedAlerts > 0 || stuckAlerts > 0;
  const setupReady = wedge?.ready ?? false;
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
  // Banner above owns the red gate and setup next — rail never competes.
  // Pay is the only rail CTA (card not on file).
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
              : "Pay with card when you’re ready — one tap on Billing opens Stripe Checkout."
            : coverage?.afterHoursNow
              ? "After hours — the line is watching for you."
              : setupReady
                ? "Front door is covered. The banner above is your next move."
                : "The banner above is your next move — finish setup there."}
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

      <ul className="pro-rail-rows">
        <li>
          <span
            className={`pro-rail-pip ${
              failedAlerts || stuckAlerts
                ? "pro-rail-pip-warn"
                : "pro-rail-pip-ok"
            }`}
            aria-hidden
          />
          <span className="pro-rail-row-label font-sans">Owner alerts</span>
          <span className="pro-rail-row-value font-sans">
            {failedAlerts
              ? `${failedAlerts} failed`
              : stuckAlerts
                ? `${stuckAlerts} stuck`
                : "Delivering"}
          </span>
        </li>
        <li>
          <span
            className={`pro-rail-pip ${
              setupReady ? "pro-rail-pip-ok" : "pro-rail-pip-warn"
            }`}
            aria-hidden
          />
          <span className="pro-rail-row-label font-sans">Line proof</span>
          <span className="pro-rail-row-value font-sans">
            {wedge ? `${setupDone}/${setupTotal}` : "—"}
          </span>
        </li>
        <li>
          <span
            className={`pro-rail-pip ${
              proven > 0 ? "pro-rail-pip-ok" : "pro-rail-pip-warn"
            }`}
            aria-hidden
          />
          <span className="pro-rail-row-label font-sans">Tonight&apos;s loop</span>
          <span className="pro-rail-row-value font-sans">
            {proven}/5 proven
          </span>
        </li>
      </ul>

      {/* Banner above owns setup; rail only shows Pay when unpaid. */}
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
