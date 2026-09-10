"use client";

import Link from "next/link";
import {
  attentionKindLabel,
  type AttentionItem,
} from "@/lib/attention-types";
import { AssignTechButton, type TechOption } from "@/components/assign-tech-button";
import { JobStatusAdvance } from "@/components/job-status-advance";
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
        item.kind === "overdue_followup" ||
        item.kind === "needs_customer_confirm" ||
        item.kind === "appointment_at_risk"),
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

function canTextConfirm(item: AttentionItem) {
  return item.kind === "needs_customer_confirm" && item.entityType === "job";
}

function canAdvanceStatus(item: AttentionItem) {
  return (
    item.kind === "appointment_at_risk" &&
    item.entityType === "job" &&
    Boolean(item.meta?.status)
  );
}

function canCopyProof(item: AttentionItem) {
  return item.kind === "stale_weekly_proof";
}

function canTestAlert(item: AttentionItem) {
  return item.kind === "alert_failed";
}

function TestAlertButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send test alert");
      onDone?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not send");
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
        onClick={() => void run()}
      >
        {busy ? "Sending…" : "Send test alert"}
      </button>
      {err ? <span className="attention-item-detail">{err}</span> : null}
    </>
  );
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


function TextConfirmButton({
  jobId,
  onDone,
  className = "attention-item-btn attention-item-btn-primary",
}: {
  jobId: string;
  onDone?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/confirm-sms`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send");
      onDone?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void run()}>
        {busy ? "Sending…" : "Text confirm"}
      </button>
      {err ? <span className="attention-item-detail">{err}</span> : null}
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
      <section
        className="attention-queue attention-queue-loading"
        aria-label="Needs attention"
        aria-busy="true"
      >
        <p className="attention-queue-kicker type-eyebrow font-sans">On the board</p>
        <div className="attention-queue-skel" aria-hidden>
          <div className="attention-skel-card">
            <span className="skeleton attention-skel-line attention-skel-line-sm" />
            <span className="skeleton attention-skel-line attention-skel-line-lg" />
            <span className="skeleton attention-skel-line attention-skel-line-md" />
          </div>
          <div className="attention-skel-card">
            <span className="skeleton attention-skel-line attention-skel-line-sm" />
            <span className="skeleton attention-skel-line attention-skel-line-lg" />
            <span className="skeleton attention-skel-line attention-skel-line-md" />
          </div>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="attention-queue attention-queue-clear" aria-label="Needs attention">
        <p className="attention-queue-kicker type-eyebrow font-sans">On the board</p>
        <h2 className="attention-queue-title font-sans">Board is clear</h2>
        <p className="attention-queue-empty font-sans">
          No urgent leads, open jobs, or overdue follow-ups. Outcomes below track the week.
        </p>
      </section>
    );
  }

  const criticalCount = items.filter((i) => i.impact === "critical").length;

  /*
    What is actually riding on the board. Every row already carried its own
    estimate and nothing added them up, so the owner deciding whether to get
    out of bed had to do the arithmetic in their head. Rolled-up rows are not
    counted, so this understates rather than overstates.
  */
  const stakeCents = items.reduce((sum, item) => sum + (item.estimatedRevenueCents ?? 0), 0);
  const stake = formatCents(stakeCents);

  return (
    <section
      id="attention-board"
      className="attention-queue"
      aria-label="Needs attention"
    >
      <div className="attention-queue-head font-sans">
        <div className="attention-queue-head-copy">
          <p className="attention-queue-kicker type-eyebrow">On the board</p>
          <h2 className="attention-queue-title">
            {items.length} {items.length === 1 ? "row needs" : "rows need"} you
          </h2>
          <p className="attention-queue-lead">
            {criticalCount > 0
              ? `${criticalCount} critical, ranked first. Act top down.`
              : "Nothing critical. Ranked by urgency — act top down."}
          </p>
        </div>
        {stake ? (
          <p className="attention-queue-stake">
            <span className="attention-queue-stake-value">{stake}</span>
            <span className="attention-queue-stake-label">on the board, estimated</span>
          </p>
        ) : null}
      </div>

      <ul className="attention-queue-list">
        {items.map((item) => {
          const showCall = canCall(item);
          const showBook = canBook(item);
          const showAssign = canAssign(item);
          const showProof = canCopyProof(item);
          const showTextConfirm = canTextConfirm(item);
          const showAdvance = canAdvanceStatus(item);
          const showTestAlert = canTestAlert(item);
          const hasPrimary =
            showCall ||
            showBook ||
            showAssign ||
            showProof ||
            showTextConfirm ||
            showAdvance ||
            showTestAlert;

          return (
            <li key={item.id}>
              <article
                className={`attention-item attention-item-${item.impact} font-sans`}
              >
                <div className="attention-item-copy">
                  <p className="attention-item-kind">
                    {item.impact === "critical" ? (
                      <span className="attention-chip attention-chip-critical">
                        Critical
                      </span>
                    ) : null}
                    <span className="attention-item-kindlabel">
                      {attentionKindLabel(item.kind)}
                    </span>
                  </p>
                  <h3 className="attention-item-title">{item.title}</h3>
                  <p className="attention-item-detail">{item.detail}</p>
                  {formatCents(item.estimatedRevenueCents) ? (
                    <p className="attention-item-value">
                      Est. {formatCents(item.estimatedRevenueCents)}
                    </p>
                  ) : null}
                  {item.rolledUp && item.group ? (
                    <Link
                      href={item.group.href ?? item.href}
                      className="attention-item-rollup"
                    >
                      +{item.rolledUp} more for {item.group.label}
                    </Link>
                  ) : null}
                </div>
                <div className="attention-item-actions">
                  {/*
                    The escape hatch leads, so the recommended action always
                    lands on the trailing edge of the row. Rows whose only
                    action is to open the record get one button, not two links
                    to the same place.
                  */}
                  {hasPrimary ? (
                    <Link href={item.href} className="attention-item-btn attention-item-btn-quiet">
                      Open
                    </Link>
                  ) : null}
                  {showCall ? (
                    <a
                      href={telHref(item.meta!.phone!)}
                      className={`attention-item-btn ${
                        showTextConfirm ? "" : "attention-item-btn-primary"
                      }`}
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
                  {showTestAlert ? (
                    <TestAlertButton onDone={() => onAction?.()} />
                  ) : null}
                  {showTextConfirm ? (
                    <TextConfirmButton
                      jobId={item.entityId}
                      onDone={() => onAction?.()}
                      className="attention-item-btn attention-item-btn-primary"
                    />
                  ) : null}
                  {showAdvance ? (
                    <JobStatusAdvance
                      jobId={item.entityId}
                      status={item.meta!.status!}
                      onAdvanced={() => onAction?.()}
                      compact
                    />
                  ) : null}
                  {hasPrimary ? null : (
                    <Link href={item.href} className="attention-item-btn attention-item-btn-primary">
                      {item.recommendedAction}
                    </Link>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
