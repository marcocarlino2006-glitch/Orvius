"use client";

import Link from "next/link";
import {
  getOwnerStandardsReport,
  standardsScore,
  type OwnerStandardItem,
} from "@/lib/institutional-standards";
import type { ShopHealth } from "@/lib/shop-health";

type ProOwnerStandardsProps = {
  health?: ShopHealth | null;
  className?: string;
};

function StandardRow({ item }: { item: OwnerStandardItem }) {
  const tone = item.ok === null ? "unknown" : item.ok ? "good" : "warn";

  return (
    <div className={`pro-setup-standard pro-setup-standard-${tone}`}>
      <span className={`pro-standards-dot pro-standards-dot-${tone}`} aria-hidden />
      <div className="pro-setup-standard-copy">
        <span className="pro-setup-standard-label">{item.label}</span>
        <span className="pro-setup-standard-value">{item.actual}</span>
      </div>
      {item.href && item.ok === false ? (
        <Link href={item.href} className="pro-setup-standard-link">
          Fix →
        </Link>
      ) : null}
    </div>
  );
}

/** Owner-facing SLA strip — required by ops:check. */
export function ProOwnerStandards({
  health = null,
  className = "",
}: ProOwnerStandardsProps) {
  const standards = getOwnerStandardsReport(health);
  const score = standardsScore(standards);

  return (
    <section
      className={`pro-setup-card pro-setup-standards ${className}`.trim()}
      aria-label="Your service level"
    >
      <div className="pro-setup-card-head font-sans">
        <p className="pro-setup-kicker">Your service level</p>
        <p className="pro-setup-title">
          {score.ready
            ? "Meeting our operating standard"
            : `${score.passed}/${score.total} standards met`}
        </p>
      </div>
      <div className="pro-setup-standards-list font-sans">
        {standards
          .filter((item) => item.id !== "loading")
          .map((item) => (
            <StandardRow key={item.id} item={item} />
          ))}
      </div>
    </section>
  );
}
