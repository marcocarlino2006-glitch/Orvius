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
 * Owner-facing economics summary — recovered $, collected $, CRM open $, proof export.
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

  const recovered = formatCents(outcomes.recoveredRevenueCents);
  const collected = formatCents(outcomes.collectedCents);
  const pipeline = formatCents(outcomes.estimatedPipelineCents);

  return (
    <section
      id="shop-economics"
      className="pro-economics font-sans"
      aria-label="Shop economics"
    >
      <div className="pro-economics-head">
        <p className="shop-outcomes-kicker type-eyebrow">Shop economics</p>
        <p className="pro-economics-title">
          {shopName ? `${shopName} · ` : ""}
          last {outcomes.windowDays} days
        </p>
      </div>

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
          <dt>Est. recovered</dt>
          <dd>{recovered ?? "—"}</dd>
          <p className="pro-economics-hint">
            {outcomes.recoveredJobsEstimate != null
              ? `${outcomes.recoveredJobsEstimate} job${outcomes.recoveredJobsEstimate === 1 ? "" : "s"} · `
              : ""}
            {outcomes.recoveredMethod === "baseline_jobs"
              ? "above your before-Orvius baseline × avg ticket"
              : outcomes.recoveredMethod === "after_hours_booked"
                ? "after-hours leads that booked × avg ticket"
                : "Set avg ticket + baseline in Settings"}
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
