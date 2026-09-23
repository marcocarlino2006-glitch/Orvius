"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

type OpsBriefingProps = {
  outcomes: ShopOutcomes | null | undefined;
  attentionCount: number;
  attentionRevenueCents?: number;
  /** Pending high-risk proposals waiting for owner OK. */
  pendingApprovals?: number;
  loading?: boolean;
};

/**
 * Command control room — six honest lanes from real shop data.
 * Never invents money; never hides under attention load.
 */
export function OpsBriefing({
  outcomes,
  attentionCount,
  attentionRevenueCents = 0,
  pendingApprovals,
  loading = false,
}: OpsBriefingProps) {
  const calls = loading ? "…" : String(outcomes?.calls ?? 0);
  const leads = loading ? "…" : String(outcomes?.leads ?? 0);
  const booked = loading ? "…" : String(outcomes?.jobsBooked ?? 0);
  const completed = loading ? "…" : String(outcomes?.jobsCompleted ?? 0);
  const needsYou = loading ? "…" : String(attentionCount);
  const collected = formatCents(outcomes?.collectedCents);
  const openInvoices = formatCents(outcomes?.openInvoiceCents);
  const influenced = formatCents(outcomes?.capturedDemandEstimatedValueCents);
  const atRisk =
    attentionRevenueCents > 0 ? formatCents(attentionRevenueCents) : null;
  const recommendValue = loading
    ? "…"
    : pendingApprovals != null
      ? String(pendingApprovals)
      : "→";

  const lanes = [
    {
      id: "in",
      label: "Came in",
      value: calls,
      detail: `${leads} qualified lead${leads === "1" ? "" : "s"}`,
      href: "/dashboard/calls",
    },
    {
      id: "understood",
      label: "Understood",
      value: leads,
      detail: "Service · urgency · location",
      href: "/dashboard/inbox",
    },
    {
      id: "happened",
      label: "Happened",
      value: booked,
      detail: `${completed} completed`,
      href: "/dashboard/jobs",
    },
    {
      id: "attention",
      label: "Needs you",
      value: needsYou,
      detail: atRisk ? `${atRisk} at risk` : "Callbacks · assign · alerts",
      href: "#attention-board",
    },
    {
      id: "money",
      label: "Money moving",
      value: loading ? "…" : (collected ?? influenced ?? "—"),
      detail: loading
        ? "…"
        : collected
          ? `Open invoices ${openInvoices ?? "—"}`
          : influenced
            ? "Estimated from avg ticket"
            : "Set avg ticket in Settings",
      href: "/dashboard/billing",
    },
    {
      id: "recommend",
      label: "Recommends",
      value: recommendValue,
      detail:
        pendingApprovals && pendingApprovals > 0
          ? "Approve next action"
          : "Orvius waits for your OK",
      href: "#agent-control",
    },
  ] as const;

  return (
    <section className="ops-briefing font-sans" aria-label="Operations briefing">
      <header className="ops-briefing-head">
        <div>
          <p className="ops-briefing-kicker">Operating console</p>
          <h2 className="ops-briefing-title">What the business is doing</h2>
        </div>
        <p className="ops-briefing-window">
          Last {outcomes?.windowDays ?? 7} days
        </p>
      </header>

      <ul className="ops-briefing-lanes">
        {lanes.map((lane) => (
          <li key={lane.id} className="ops-briefing-lane" data-lane={lane.id}>
            <Link href={lane.href} className="ops-briefing-lane-link">
              <p className="ops-briefing-label">{lane.label}</p>
              <p className="ops-briefing-value">{lane.value}</p>
              <p className="ops-briefing-detail">{lane.detail}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="ops-briefing-graph" aria-label="Business graph">
        <span className="ops-briefing-graph-kicker">Business graph</span>
        Call → Lead → Customer → Property → Job → Technician → Estimate →
        Payment → Repeat
      </p>
    </section>
  );
}
