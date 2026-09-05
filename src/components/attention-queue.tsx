"use client";

import Link from "next/link";
import {
  attentionKindLabel,
  type AttentionItem,
} from "@/lib/attention-queue";
import { AssignTechButton, type TechOption } from "@/components/assign-tech-button";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { telHref } from "@/lib/demo-line";
import { formatCents } from "@/lib/money";
import { copyWeeklyProofRitual } from "@/lib/weekly-proof-client";
import { useState } from "react";

type AttentionQueueProps = {
  items: AttentionItem[];
  loading?: boolean;
  technicians?: TechOption[];
  onAction?: () => void;
};

function canCall(item: AttentionItem) {
  return Boolean(
    item.meta?.phone &&
      (item.kind === "urgent_lead" ||
        item.kind === "new_lead" ||
        item.kind === "needs_qualify" ||
        item.kind === "needs_booking" ||
        item.kind === "overdue_followup"),
  );
}

function canBook(item: AttentionItem) {
  return (
    (item.kind === "needs_booking" ||
      item.kind === "urgent_lead" ||
      item.kind === "overdue_followup") &&
    item.entityType === "lead"
  );
}

function canAssign(item: AttentionItem) {
  return item.kind === "unassigned_job" && item.entityType === "job";
}

function canCopyProof(item: AttentionItem) {
  return item.kind === "stale_weekly_proof";
}

function CopyProofButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      await copyWeeklyProofRitual();
      onDone?.();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="attention-item-btn attention-item-btn-primary"
        disabled={busy}
        onClick={run}
      >
        {busy ? "Copying…" : "Copy proof"}
      </button>
      {err ? (
        <span className="attention-item-detail">Could not copy — try again</span>
      ) : null}
    </>
  );
}

export function AttentionQueue({
  items,
  loading,
  technicians = [],
  onAction,
}: AttentionQueueProps) {
  if (loading && !items.length) {
    return (
      <section className="attention-queue" aria-label="Needs attention">
        <p className="attention-queue-kicker type-eyebrow font-sans">Needs you</p>
        <p className="attention-queue-empty font-sans">Loading what needs you…</p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="attention-queue attention-queue-clear" aria-label="Needs attention">
        <p className="attention-queue-kicker type-eyebrow font-sans">Needs you</p>
        <h2 className="attention-queue-title font-sans">You&apos;re clear</h2>
        <p className="attention-queue-empty font-sans">
          No urgent leads, unassigned jobs, or overdue follow-ups. Outcomes below track the week.
        </p>
      </section>
    );
  }

  return (
    <section className="attention-queue" aria-label="Needs attention">
      <div className="attention-queue-head font-sans">
        <p className="attention-queue-kicker type-eyebrow">Needs you</p>
        <h2 className="attention-queue-title">
          {items.length} item{items.length === 1 ? "" : "s"} need attention
        </h2>
        <p className="attention-queue-lead">
          Ranked by urgency and field impact. Act here — don&apos;t hunt the dashboard.
        </p>
      </div>

      <ul className="attention-queue-list">
        {items.map((item) => {
          const showCall = canCall(item);
          const showBook = canBook(item);
          const showAssign = canAssign(item);
          const showProof = canCopyProof(item);
          const hasPrimary = showCall || showBook || showAssign || showProof;

          return (
            <li key={item.id}>
              <article
                className={`attention-item attention-item-${item.impact} font-sans`}
              >
                <div className="attention-item-copy">
                  <p className="attention-item-kind">
                    {attentionKindLabel(item.kind)}
                    {item.impact === "critical" ? " · critical" : null}
                  </p>
                  <h3 className="attention-item-title">{item.title}</h3>
                  <p className="attention-item-detail">{item.detail}</p>
                  {formatCents(item.estimatedRevenueCents) ? (
                    <p className="attention-item-value">
                      Est. {formatCents(item.estimatedRevenueCents)}
                    </p>
                  ) : null}
                </div>
                <div className="attention-item-actions">
                  {showCall ? (
                    <a
                      href={telHref(item.meta!.phone!)}
                      className="attention-item-btn attention-item-btn-primary"
                    >
                      Call
                    </a>
                  ) : null}
                  {showBook ? (
                    <BookJobQuickButton
                      leadId={item.entityId}
                      onBooked={() => onAction?.()}
                      className={
                        showCall
                          ? "attention-item-btn"
                          : "attention-item-btn attention-item-btn-primary"
                      }
                    />
                  ) : null}
                  {showAssign ? (
                    <AssignTechButton
                      jobId={item.entityId}
                      technicians={technicians}
                      onAssigned={() => onAction?.()}
                      compact
                      className="attention-item-assign"
                    />
                  ) : null}
                  {showProof ? <CopyProofButton onDone={() => onAction?.()} /> : null}
                  <Link
                    href={item.href}
                    className={`attention-item-btn ${
                      hasPrimary ? "" : "attention-item-btn-primary"
                    }`}
                  >
                    {hasPrimary ? "Open" : item.recommendedAction}
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
