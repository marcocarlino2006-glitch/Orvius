"use client";

import Link from "next/link";
import {
  getOwnerStandardsReport,
  ownerSlAs,
  standardsScore,
  type OwnerStandardItem,
} from "@/lib/institutional-standards";
import type { ShopHealth } from "@/lib/shop-health";

type ProOwnerStandardsProps = {
  health?: ShopHealth | null;
  compact?: boolean;
};

function StandardRow({ item }: { item: OwnerStandardItem }) {
  const tone =
    item.ok === null ? "unknown" : item.ok ? "good" : "warn";

  const content = (
    <>
      <span className={`pro-standards-dot pro-standards-dot-${tone}`} aria-hidden />
      <div className="pro-standards-copy">
        <span className="pro-standards-label">{item.label}</span>
        <span className="pro-standards-target">{item.target}</span>
        <span className="pro-standards-actual">{item.actual}</span>
      </div>
    </>
  );

  if (item.href && item.ok === false) {
    return (
      <Link href={item.href} className="pro-standards-item pro-standards-item-link">
        {content}
      </Link>
    );
  }

  return <div className="pro-standards-item">{content}</div>;
}

export function ProOwnerStandards({ health, compact = false }: ProOwnerStandardsProps) {
  const items = getOwnerStandardsReport(health ?? null);
  const score = standardsScore(items);

  if (compact && score.ready) return null;

  return (
    <section
      className={`pro-standards ${compact ? "pro-standards-compact" : ""}`}
      aria-label="Service standards"
    >
      <div className="pro-standards-head font-sans">
        <p className="pro-standards-kicker">Your service level</p>
        <p className="pro-standards-title">
          {score.ready
            ? "Meeting our operating standard"
            : `${score.passed}/${score.total} standards met`}
        </p>
        {!compact ? (
          <p className="pro-standards-detail">
            The same bar we hold for design partners — measured on your shop, not
            marketing copy. Alerts target under {ownerSlAs.alertP95TargetSec}s to
            your phone.
          </p>
        ) : null}
      </div>

      <ul className="pro-standards-list font-sans">
        {items
          .filter((item) => item.id !== "loading")
          .slice(0, compact ? 3 : undefined)
          .map((item) => (
            <li key={item.id}>
              <StandardRow item={item} />
            </li>
          ))}
      </ul>

      {!compact ? (
        <p className="pro-standards-foot font-sans">
          Billed by {ownerSlAs.billingEntity} ·{" "}
          <Link href="/security" className="pro-standards-link">
            Security & compliance
          </Link>
        </p>
      ) : null}
    </section>
  );
}
