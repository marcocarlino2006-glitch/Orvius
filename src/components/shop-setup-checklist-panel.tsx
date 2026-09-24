"use client";

import Link from "next/link";
import type { ShopSetupChecklist } from "@/lib/shop-setup-checklist";

type ShopSetupChecklistPanelProps = {
  checklist: ShopSetupChecklist;
  className?: string;
};

/**
 * Readiness path — every step visible as a stop on one line, exactly one next
 * action expanded. Never claims a step done that the records do not prove.
 */
export function ShopSetupChecklistPanel({
  checklist,
  className = "",
}: ShopSetupChecklistPanelProps) {
  const { next, doneCount, totalCount, progress, steps } = checklist;

  return (
    <section
      className={`rp font-sans ${className}`.trim()}
      aria-label="Readiness path"
    >
      <header className="rp-head">
        <div>
          <p className="rp-kicker">Readiness</p>
          <h2 className="rp-title">
            {next ? "Get Orvius ready to run the shop" : "Orvius is ready to operate"}
          </h2>
        </div>
        <p className="rp-count">
          {doneCount} of {totalCount}
        </p>
      </header>

      <div
        className="rp-meter"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <ol className="rp-steps">
        {steps.map((step, index) => {
          const state = step.done ? "done" : next?.id === step.id ? "next" : "todo";
          return (
            <li key={step.id} className={`rp-step rp-step--${state}`}>
              <Link href={step.href} className="rp-step-link" aria-current={state === "next" ? "step" : undefined}>
                <span className="rp-step-mark" aria-hidden>
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="rp-step-label">{step.label}</span>
                <span className="sr-only">{step.done ? " — done" : state === "next" ? " — next" : ""}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      {next ? (
        <div className="rp-next">
          <div>
            <p className="rp-next-kicker">Next · {next.label}</p>
            <p className="rp-next-detail">{next.detail}</p>
          </div>
          <Link href={next.href} className="ox-btn ox-btn--primary">
            {next.id === "verify" ? "Place test call" : `Set up ${next.label.toLowerCase()}`}
          </Link>
        </div>
      ) : (
        <div className="rp-next rp-next--done">
          <div>
            <p className="rp-next-kicker">All steps verified</p>
            <p className="rp-next-detail">Calls are answered, understood, and routed with your rules.</p>
          </div>
          <Link href="/dashboard" className="ox-btn ox-btn--quiet">
            Open Command
          </Link>
        </div>
      )}
    </section>
  );
}
