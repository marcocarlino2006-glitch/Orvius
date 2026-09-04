"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type ProEconomicsPanelProps = {
  outcomes: ShopOutcomes | null | undefined;
  shopName?: string;
};

/**
 * Owner-facing economics summary — recovered $, collected $, CRM open $, proof export.
 */
export function ProEconomicsPanel({ outcomes, shopName }: ProEconomicsPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const [busy, setBusy] = useState(false);

  if (!outcomes) return null;

  async function copyWeeklyProof() {
    setBusy(true);
    setCopyState("idle");
    try {
      const res = await fetch("/api/shop/weekly-proof");
      if (!res.ok) throw new Error("proof failed");
      const data = (await res.json()) as { text: string };
      await navigator.clipboard.writeText(data.text);
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
    <section className="pro-economics font-sans" aria-label="Shop economics">
      <div className="pro-economics-head">
        <p className="shop-outcomes-kicker type-eyebrow">Shop economics</p>
        <p className="pro-economics-title">
          {shopName ? `${shopName} · ` : ""}
          last {outcomes.windowDays} days
        </p>
      </div>

      <dl className="pro-economics-grid">
        <div>
          <dt>Est. recovered</dt>
          <dd>{recovered ?? "—"}</dd>
          <p className="pro-economics-hint">
            {outcomes.recoveredMethod === "baseline_jobs"
              ? "Jobs/week above your before-Orvius baseline × avg ticket"
              : outcomes.recoveredMethod === "after_hours_booked"
                ? "After-hours leads that booked × avg ticket"
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
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={busy}
          onClick={copyWeeklyProof}
        >
          {busy ? "Preparing…" : "Copy weekly proof"}
        </button>
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
