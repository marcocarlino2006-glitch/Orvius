"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import { copyWeeklyProofRitual } from "@/lib/weekly-proof-client";

type ProEconomicsPanelProps = {
  outcomes: ShopOutcomes | null | undefined;
  shopName?: string;
  lastWeeklyProofAt?: string | null;
  /** The board above is already carrying the due-proof row and its one-click copy. */
  proofOnBoard?: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Owner economics — the funnel, then the money, then the proof.
 *
 * This used to be two sections stacked on the board. One was headed "last 7
 * days · economics" and the other "shop economics · last 7 days", and between
 * them they printed the pipeline twice, collected twice, and jobs booked
 * under two different names. An owner reading down the page had to work out
 * whether the second panel was new information. It was not.
 *
 * So the counts and the dollars are one section now, in that order, because
 * the counts explain the dollars: calls became leads became jobs, and the
 * jobs are what the money is.
 */
export function ProEconomicsPanel({
  outcomes,
  shopName,
  lastWeeklyProofAt,
  proofOnBoard = false,
}: ProEconomicsPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const [busy, setBusy] = useState(false);
  const [proofAt, setProofAt] = useState<string | null>(lastWeeklyProofAt ?? null);

  useEffect(() => {
    setProofAt(lastWeeklyProofAt ?? null);
  }, [lastWeeklyProofAt]);

  if (!outcomes) return null;

  // Nothing landed this window, so there is nothing to prove — do not nag a
  // shop into copying a page of zeros.
  const nothingToProve = outcomes.calls === 0 && outcomes.leads === 0;
  const parsed = proofAt ? new Date(proofAt) : null;
  const copiedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const stale = !nothingToProve && (!copiedAt || Date.now() - copiedAt.getTime() > WEEK_MS);

  async function copyWeeklyProof() {
    setBusy(true);
    setCopyState("idle");
    try {
      const data = await copyWeeklyProofRitual();
      setProofAt(data.lastWeeklyProofAt ?? new Date().toISOString());
      setCopyState("ok");
    } catch {
      setCopyState("err");
    } finally {
      setBusy(false);
    }
  }

  const capturedValue = formatCents(
    outcomes.capturedDemandEstimatedValueCents,
  );
  const collected = formatCents(outcomes.collectedCents);
  const pipeline = formatCents(outcomes.estimatedPipelineCents);

  const funnel = [
    { label: "Calls", value: String(outcomes.calls) },
    { label: "Leads", value: String(outcomes.leads) },
    { label: "Booked", value: String(outcomes.jobsBooked) },
    {
      label: "Booking rate",
      value: outcomes.bookingRate != null ? `${outcomes.bookingRate}%` : "—",
    },
  ];

  return (
    <section
      id="shop-economics"
      className="pro-economics font-sans"
      aria-label="Shop economics"
    >
      <div className="pro-economics-head">
        <p className="pro-economics-title">
          {shopName ? `${shopName} · ` : ""}
          Last {outcomes.windowDays} days
        </p>
      </div>

      {/* The funnel first: these counts are what the dollars below are made of. */}
      <dl className="pro-economics-funnel">
        {funnel.map((step, index) => (
          <div key={step.label}>
            {index > 0 ? <span className="pro-economics-funnel-arrow" aria-hidden /> : null}
            <dt>{step.label}</dt>
            <dd>{step.value}</dd>
          </div>
        ))}
      </dl>

      {stale && !proofOnBoard ? (
        <p className="pro-economics-stale font-sans" role="status">
          Weekly proof is stale or missing — copy a fresh proof for this week&apos;s
          design-partner ritual.
        </p>
      ) : copiedAt ? (
        <p className="pro-economics-proof-meta font-sans">
          Last proof copied{" "}
          {copiedAt.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : nothingToProve ? (
        <p className="pro-economics-proof-meta font-sans">
          Nothing landed this window, so there is no proof to copy yet.
        </p>
      ) : null}

      <dl className="pro-economics-grid">
        <div>
          <dt>Booked from Orvius</dt>
          <dd>
            {outcomes.capturedDemandJobs}{" "}
            {outcomes.capturedDemandJobs === 1 ? "job" : "jobs"}
          </dd>
          <p className="pro-economics-hint">
            {capturedValue
              ? `${capturedValue} est. value at your avg ticket`
              : "Measured bookings from calls and texts"}
          </p>
        </div>
        <div>
          <dt>Collected</dt>
          <dd>{collected ?? "$0"}</dd>
          <p className="pro-economics-hint">Recorded payments in the window</p>
        </div>
        <div>
          <dt>Pipeline (jobs)</dt>
          <dd>{pipeline ?? "—"}</dd>
          <p className="pro-economics-hint">Jobs booked × avg ticket</p>
        </div>
        <div>
          <dt>Open money</dt>
          <dd>
            {formatCents(outcomes.openEstimateCents + outcomes.openInvoiceCents) ??
              "$0"}
          </dd>
          <p className="pro-economics-hint">
            Estimates {formatCents(outcomes.openEstimateCents) ?? "$0"} · invoices{" "}
            {formatCents(outcomes.openInvoiceCents) ?? "$0"}
          </p>
        </div>
      </dl>

      {/*
        The nuance the grid cannot hold: which of these were after hours,
        which were emergencies, and what is still unmeasured because the shop
        has not set a baseline.
      */}
      <ul className="pro-economics-notes">
        {outcomes.afterHoursLeads > 0 ? (
          <li>
            <strong>{outcomes.afterHoursLeads}</strong> after-hours leads ·{" "}
            <strong>{outcomes.afterHoursBooked}</strong> booked
          </li>
        ) : null}
        {outcomes.emergenciesBooked > 0 ? (
          <li>
            <strong>{outcomes.emergenciesBooked}</strong> emergencies booked
          </li>
        ) : null}
        {outcomes.unassignedJobs > 0 ? (
          <li>
            <strong>{outcomes.unassignedJobs}</strong> jobs still need a tech
          </li>
        ) : null}
        {outcomes.jobsPerWeekVsBaseline != null ? (
          <li>
            Jobs/week vs before Orvius:{" "}
            <strong>
              {outcomes.jobsPerWeekVsBaseline > 0 ? "+" : ""}
              {outcomes.jobsPerWeekVsBaseline}
            </strong>
            {" · owner-reported context, not attribution"}
          </li>
        ) : null}
        {!outcomes.avgTicketCents ? (
          <li>
            <Link href="/dashboard/settings" className="pro-section-link">
              Set avg ticket →
            </Link>{" "}
            to estimate captured-demand value
          </li>
        ) : null}
        {!outcomes.economicsReady ? (
          <li>
            <Link href="/dashboard/settings" className="pro-section-link">
              Set before-Orvius baseline →
            </Link>{" "}
            for measured lift (jobs/week + missed calls)
          </li>
        ) : null}
      </ul>

      <div className="pro-economics-actions">
        {stale && proofOnBoard ? (
          <a href="#attention-board" className="pro-economics-pointer font-sans">
            Weekly proof is due — copy it from the board above
          </a>
        ) : (
          <button
            type="button"
            className={`btn text-sm ${stale ? "btn-void" : "btn-secondary"}`}
            disabled={busy}
            onClick={copyWeeklyProof}
          >
            {busy ? "Preparing…" : stale ? "Copy weekly proof (due)" : "Copy weekly proof"}
          </button>
        )}
        <Link href="/dashboard/settings" className="pro-section-link text-sm">
          Edit ticket &amp; baseline →
        </Link>
        {copyState === "ok" ? (
          <span className="pro-economics-status">Copied — paste into notes / Slack</span>
        ) : null}
        {copyState === "err" ? (
          <span className="pro-economics-status pro-economics-status--err">
            Could not copy — try again signed in
          </span>
        ) : null}
      </div>
    </section>
  );
}
