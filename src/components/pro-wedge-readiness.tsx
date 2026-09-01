"use client";

import Link from "next/link";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProWedgeReadinessProps = {
  readiness?: WedgeReadiness | null;
};

export function ProWedgeReadiness({ readiness }: ProWedgeReadinessProps) {
  if (!readiness || readiness.ready) return null;

  const remaining = readiness.total - readiness.score;

  return (
    <div className="pro-wedge-readiness" role="status">
      <div className="pro-wedge-readiness-head font-sans">
        <p className="pro-wedge-readiness-kicker">Go-live checklist</p>
        <p className="pro-wedge-readiness-title">
          {remaining} step{remaining === 1 ? "" : "s"} before your shop is bulletproof
        </p>
        <p className="pro-wedge-readiness-detail">
          Complete these once — then every call, alert, and lead is production-grade.
        </p>
      </div>
      <ul className="pro-wedge-readiness-list font-sans">
        {readiness.items
          .filter((item) => !item.ok)
          .map((item) => (
            <li key={item.id} className="pro-wedge-readiness-item">
              <span className="pro-wedge-readiness-check" aria-hidden>
                ○
              </span>
              <div className="pro-wedge-readiness-copy">
                <span className="pro-wedge-readiness-label">{item.label}</span>
                <span className="pro-wedge-readiness-item-detail">{item.detail}</span>
              </div>
              {item.actionHref ? (
                <Link href={item.actionHref} className="pro-wedge-readiness-link">
                  Fix →
                </Link>
              ) : null}
            </li>
          ))}
      </ul>
    </div>
  );
}
