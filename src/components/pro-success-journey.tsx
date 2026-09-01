"use client";

import Link from "next/link";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProSuccessJourneyProps = {
  wedge?: WedgeReadiness | null;
};

export function ProSuccessJourney({ wedge }: ProSuccessJourneyProps) {
  if (!wedge) return null;

  const done = wedge.score;
  const total = wedge.total;

  return (
    <section className="pro-success-journey" aria-label="Implementation progress">
      <div className="pro-success-journey-head font-sans">
        <p className="pro-success-journey-kicker">Implementation</p>
        <p className="pro-success-journey-title">
          {wedge.ready
            ? "Go-live complete"
            : `${done}/${total} milestones — same checklist we use for design partners`}
        </p>
        {!wedge.ready ? (
          <p className="pro-success-journey-detail">
            Serious operators do not go live until every step below is green. This
            is how multi-location shops onboard — one shop, proven end-to-end.
          </p>
        ) : null}
      </div>

      <ol className="pro-success-journey-list font-sans">
        {wedge.items.map((item) => (
          <li
            key={item.id}
            className={`pro-success-journey-step ${item.ok ? "pro-success-journey-step-done" : ""}`}
          >
            <span className="pro-success-journey-check" aria-hidden>
              {item.ok ? "✓" : "○"}
            </span>
            <div className="pro-success-journey-copy">
              <span className="pro-success-journey-label">{item.label}</span>
              <span className="pro-success-journey-item-detail">{item.detail}</span>
            </div>
            {!item.ok && item.actionHref ? (
              <Link href={item.actionHref} className="pro-success-journey-link">
                Fix →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
