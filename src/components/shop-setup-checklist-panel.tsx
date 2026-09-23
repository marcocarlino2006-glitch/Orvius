"use client";

import Link from "next/link";
import type { ShopSetupChecklist } from "@/lib/shop-setup-checklist";

type ShopSetupChecklistPanelProps = {
  checklist: ShopSetupChecklist;
  className?: string;
};

/**
 * Guided setup — progress + one next action. Never claims done when incomplete.
 */
export function ShopSetupChecklistPanel({
  checklist,
  className = "",
}: ShopSetupChecklistPanelProps) {
  const { next, doneCount, totalCount, progress, steps, readyForNight } =
    checklist;

  return (
    <section
      className={`shop-setup-checklist font-sans ${className}`.trim()}
      aria-label="Shop setup checklist"
    >
      <div className="shop-setup-checklist-head">
        <div>
          <p className="shop-setup-checklist-kicker">Setup</p>
          <h2 className="shop-setup-checklist-title">
            {readyForNight
              ? "Night line can run — finish the rest when you can"
              : "Finish shop setup"}
          </h2>
          <p className="shop-setup-checklist-lead">
            {doneCount} of {totalCount} complete
            {next ? ` · Next: ${next.label}` : " · All steps done"}
          </p>
        </div>
        {next ? (
          <Link href={next.href} className="btn btn-void text-sm">
            {next.label} →
          </Link>
        ) : (
          <Link href="/dashboard" className="btn btn-void text-sm">
            Open Command
          </Link>
        )}
      </div>

      <div
        className="shop-setup-checklist-meter"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <ol className="shop-setup-checklist-list">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`shop-setup-checklist-item ${step.done ? "is-done" : ""} ${
              next?.id === step.id ? "is-next" : ""
            }`}
          >
            <span className="shop-setup-checklist-mark" aria-hidden>
              {step.done ? "✓" : next?.id === step.id ? "→" : "·"}
            </span>
            <div className="shop-setup-checklist-copy">
              <p className="shop-setup-checklist-label">{step.label}</p>
              <p className="shop-setup-checklist-detail">{step.detail}</p>
            </div>
            {!step.done ? (
              <Link href={step.href} className="shop-setup-checklist-link">
                Open
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
