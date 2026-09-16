"use client";

import Link from "next/link";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

/**
 * Setup score — how much of the front door is actually proven, and the single
 * next thing to fix. Scored by the same checks the go-live gate uses.
 */
export function ProSetupScore({ wedge }: { wedge: WedgeReadiness | null | undefined }) {
  if (!wedge) return null;

  const next = wedge.items.find((item) => !item.ok);
  const pct = wedge.total ? Math.round((wedge.score / wedge.total) * 100) : 0;

  return (
    <section className="pro-rail-card pro-setup-score">
      <div className="pro-rail-card-head">
        <p className="pro-rail-card-title font-sans">Setup score</p>
        <span
          className={`pro-rail-status ${
            wedge.ready ? "pro-rail-status-healthy" : "pro-rail-status-attention"
          }`}
        >
          {wedge.score}/{wedge.total}
        </span>
      </div>

      <div className="pro-setup-score-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>

      {next ? (
        <>
          <p className="pro-setup-score-next font-sans">{next.label}</p>
          <p className="pro-setup-score-detail font-sans">{next.detail}</p>
        </>
      ) : (
        <p className="pro-setup-score-detail font-sans">
          Every front-door check passes. Keep the weekly proof stamped.
        </p>
      )}

      <div className="pro-rail-card-foot font-sans">
        <span>
          {wedge.total - wedge.score > 0
            ? `${wedge.total - wedge.score} left to prove`
            : "All checks proven"}
        </span>
        <Link
          href={next?.actionHref ?? "/dashboard/settings"}
          className="pro-section-link"
        >
          {next ? "Fix this →" : "Settings →"}
        </Link>
      </div>
    </section>
  );
}
