"use client";

import Link from "next/link";
import { company } from "@/lib/company";
import { buildPipelineProof } from "@/lib/pipeline-proof";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProLaunchControlProps = {
  wedge?: WedgeReadiness | null;
  events: ShiftEvent[];
  moneyEnabled: boolean;
  checkoutReady: boolean;
  billingStatus?: string | null;
  referenceImplementation?: boolean;
};

export function ProLaunchControl({
  wedge,
  events,
  moneyEnabled,
  checkoutReady,
  billingStatus,
  referenceImplementation = false,
}: ProLaunchControlProps) {
  const proof = buildPipelineProof(events, moneyEnabled);
  const proven = proof.filter((stage) => stage.state === "proven").length;
  const setupDone = wedge?.score ?? 0;
  const setupTotal = wedge?.total ?? 0;
  const ready = Boolean(wedge?.ready && checkoutReady && proven >= 4);
  const access =
    billingStatus === "active" || billingStatus === "past_due"
      ? "Paid account"
      : "Design partner";

  return (
    <section className="pro-rail-card pro-launch-control">
      <div className="pro-rail-card-head">
        <p className="pro-rail-card-title font-sans">Launch control</p>
        <span
          className={`pro-rail-status ${
            ready ? "pro-rail-status-healthy" : "pro-rail-status-attention"
          }`}
        >
          {ready ? "Proven" : "Verifying"}
        </span>
      </div>

      <ul className="pro-rail-rows">
        <li>
          <span className="pro-rail-row-label font-sans">Shop setup</span>
          <span className="pro-rail-row-value font-sans">
            {setupTotal ? `${setupDone}/${setupTotal}` : "Loading"}
          </span>
        </li>
        <li>
          <span className="pro-rail-row-label font-sans">Runtime proof</span>
          <span className="pro-rail-row-value font-sans">{proven}/5 stages</span>
        </li>
        <li>
          <span className="pro-rail-row-label font-sans">Billing</span>
          <span className="pro-rail-row-value font-sans">
            {checkoutReady ? "Checkout ready" : "Founder setup"}
          </span>
        </li>
        <li>
          <span className="pro-rail-row-label font-sans">Access</span>
          <span className="pro-rail-row-value font-sans">{access}</span>
        </li>
      </ul>

      {referenceImplementation ? (
        <p className="pro-launch-disclosure font-sans">
          Reference environment. Activity is illustrative, not customer results.
        </p>
      ) : (
        <p className="pro-launch-disclosure font-sans">
          Founder-assisted operations while automation is being proven.
        </p>
      )}

      <div className="pro-rail-card-foot font-sans">
        <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
        <Link href="/dashboard/settings">Readiness →</Link>
      </div>
    </section>
  );
}
