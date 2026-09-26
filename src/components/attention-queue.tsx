"use client";

import { toast } from "@/components/toaster";
import Link from "next/link";
import {
  attentionActionStrategy,
  attentionKindLabel,
  type AttentionItem,
} from "@/lib/attention-types";
import { AssignTechButton, type TechOption } from "@/components/assign-tech-button";
import { JobStatusAdvance } from "@/components/job-status-advance";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { telHref } from "@/lib/demo-line";
import { leadNextAction } from "@/lib/lead-next-action";
import { formatCents } from "@/lib/money";
import { copyWeeklyProofRitual } from "@/lib/weekly-proof-client";
import { formatAge, type WorkItem } from "@/lib/command-model";
import type { RecordType } from "@/lib/record-types";
import { RecordLink } from "@/components/record-drawer";
import { useEffect, useState } from "react";

function canCall(item: AttentionItem) {
  const strategy = attentionActionStrategy(item.kind);
  return Boolean(
    item.meta?.phone &&
      (strategy === "call" ||
        strategy === "book" ||
        strategy === "text_confirm" ||
        strategy === "advance_status"),
  );
}

function canBookStrategy(item: AttentionItem) {
  const strategy = attentionActionStrategy(item.kind);
  return (
    item.entityType === "lead" &&
    (strategy === "book" || item.kind === "urgent_lead" || item.kind === "overdue_followup")
  );
}

function leadNext(item: AttentionItem) {
  if (item.entityType !== "lead") return null;
  return leadNextAction({
    status: item.meta?.status ?? "new",
    urgency: item.meta?.urgency ?? null,
    phone: item.meta?.phone ?? null,
    address: item.meta?.address ?? null,
    jobId: null,
  });
}

function canBook(item: AttentionItem) {
  return canBookStrategy(item) && leadNext(item)?.kind === "book";
}

function canAssign(item: AttentionItem) {
  return (
    attentionActionStrategy(item.kind) === "assign" && item.entityType === "job"
  );
}

function canTextConfirm(item: AttentionItem) {
  return (
    attentionActionStrategy(item.kind) === "text_confirm" &&
    item.entityType === "job"
  );
}

function canAdvanceStatus(item: AttentionItem) {
  return (
    attentionActionStrategy(item.kind) === "advance_status" &&
    item.entityType === "job" &&
    Boolean(item.meta?.status)
  );
}

function canCopyProof(item: AttentionItem) {
  return attentionActionStrategy(item.kind) === "proof";
}

function canTestAlert(item: AttentionItem) {
  return attentionActionStrategy(item.kind) === "test_alert";
}

function canDismissNotAJob(item: AttentionItem) {
  return (
    attentionActionStrategy(item.kind) === "dismiss" && item.entityType === "lead"
  );
}

function MarkNotAJobButton({
  leadId,
  onDone,
}: {
  leadId: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "spam" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not clear lead");
      toast({ title: "Cleared as spam" });
      onDone?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not clear");
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
        {busy ? "Clearing…" : "Not a job"}
      </button>
      {err ? <span className="attention-item-detail">{err}</span> : null}
    </>
  );
}

function TestAlertButton({ onDone, quiet = false }: { onDone?: () => void; quiet?: boolean }) {
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
        ok?: boolean;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send test alert");
      if (!data?.ok) {
        throw new Error(
          data?.error ??
            "Alert queued but not delivered. Check Settings.",
        );
      }
      toast({ title: "Test alert sent. Check your phone." });
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
        className={quiet ? "attention-item-btn" : "attention-item-btn attention-item-btn-primary"}
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Sending…" : quiet ? "Send test" : "Send test alert"}
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
      toast({ title: "Copied" });
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
      toast({ title: "Confirmation text sent" });
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

function PrimaryAction({
  work,
  technicians,
  onAction,
}: {
  work: WorkItem;
  technicians: TechOption[];
  onAction?: () => void;
}) {
  const item = work.source;
  const primary = "attention-item-btn attention-item-btn-primary";

  if (work.id.startsWith("incident:")) {
    return (
      <>
        <Link
          href={
            item.kind === "alert_failed" || item.kind === "alerts_muted"
              ? "/dashboard/settings#owner-alerts"
              : item.href
          }
          className={primary}
        >
          Fix setup
        </Link>
        {canTestAlert(item) ? <TestAlertButton onDone={onAction} quiet /> : null}
      </>
    );
  }
  if (canTestAlert(item)) return <TestAlertButton onDone={onAction} />;
  if (canAssign(item)) {
    return (
      <AssignTechButton
        jobId={item.entityId}
        technicians={technicians}
        onAssigned={() => onAction?.()}
        compact
        className="attention-item-assign"
      />
    );
  }
  const next = canBookStrategy(item) ? leadNext(item) : null;
  if (next?.kind === "call") {
    return (
      <a href={telHref(next.phone)} className={primary}>
        {next.label}
      </a>
    );
  }
  if (canBook(item)) {
    return (
      <BookJobQuickButton leadId={item.entityId} onBooked={() => onAction?.()} className={primary} />
    );
  }
  if (canTextConfirm(item)) {
    return <TextConfirmButton jobId={item.entityId} onDone={() => onAction?.()} className={primary} />;
  }
  if (canAdvanceStatus(item)) {
    return (
      <JobStatusAdvance jobId={item.entityId} status={item.meta!.status!} onAdvanced={() => onAction?.()} compact />
    );
  }
  if (canCall(item)) {
    return (
      <a href={telHref(item.meta!.phone!)} className={primary}>
        Call back
      </a>
    );
  }
  if (canCopyProof(item)) return <CopyProofButton onDone={() => onAction?.()} />;
  if (canDismissNotAJob(item)) {
    return <MarkNotAJobButton leadId={item.entityId} onDone={() => onAction?.()} />;
  }
  return (
    <Link href={item.href} className={primary}>
      {item.recommendedAction || "Open"}
    </Link>
  );
}

const SEVERITY_LABEL: Record<WorkItem["severity"], string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
};

function drawerTarget(item: AttentionItem): { type: RecordType; id: string } | null {
  if (item.entityType === "lead") return { type: "lead", id: item.entityId };
  if (item.entityType === "job") return { type: "job", id: item.entityId };
  return null;
}

export function AttentionQueue({
  work,
  loading,
  technicians = [],
  onAction,
}: {
  work: WorkItem[];
  loading?: boolean;
  technicians?: TechOption[];
  onAction?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !work.length) {
    return (
      <section id="work-queue" className="wq wq--loading" aria-label="Work queue" aria-busy="true">
        <header className="wq-head">
          <h2 className="wq-title">Work queue</h2>
        </header>
        <div className="wq-skel" aria-hidden>
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      </section>
    );
  }

  if (!work.length) {
    return (
      <section id="work-queue" className="wq wq--clear" aria-label="Work queue">
        <div className="ox-state ox-state--success">
          <p className="ox-state-title">Queue is clear</p>
          <p className="ox-state-copy">
            Nothing is waiting on you. New calls and messages land here the moment Orvius needs a decision.
          </p>
        </div>
      </section>
    );
  }

  const [top, ...rest] = work;
  const visible = expanded ? rest : rest.slice(0, 6);

  return (
    <section id="work-queue" className="wq" aria-label="Work queue">
      <header className="wq-head">
        <h2 className="wq-title">
          Queue <span className="wq-title-count">{work.length}</span>
        </h2>
      </header>

      <article className={`wq-recommend wq-sev--${top!.severity}`} aria-label="Top priority">
        <div className="wq-recommend-copy">
          <WorkRowBody work={top!} now={now} large />
        </div>
        <div className="wq-actions">
          <PrimaryAction work={top!} technicians={technicians} onAction={onAction} />
        </div>
      </article>

      {visible.length ? (
        <ul className="wq-list">
          {visible.map((w) => (
            <li key={w.id} className={`wq-row wq-sev--${w.severity}`}>
              <WorkRowBody work={w} now={now} />
              <div className="wq-actions">
                <PrimaryAction work={w} technicians={technicians} onAction={onAction} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {rest.length > 6 ? (
        <button type="button" className="wq-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show highest priority only" : `Show ${rest.length - 6} more`}
        </button>
      ) : null}
    </section>
  );
}

function ageLabel(iso: string, now: number): string {
  const age = formatAge(iso, now);
  return age === "just now" ? age : `${age} ago`;
}

function WorkRowBody({ work, now, large = false }: { work: WorkItem; now: number; large?: boolean }) {
  const target = drawerTarget(work.source);
  const impact = work.impactCents ? formatCents(work.impactCents) : null;
  const subject = <span className={large ? "wq-subject wq-subject--lg" : "wq-subject"}>{work.subject}</span>;

  return (
    <div className="wq-body">
      <div className="wq-line1">
        <span className={`wq-sev wq-sev-pill--${work.severity}`}>{SEVERITY_LABEL[work.severity]}</span>
        {target ? (
          <RecordLink type={target.type} id={target.id} href={work.source.href} className="wq-subject-link">
            {subject}
          </RecordLink>
        ) : (
          subject
        )}
        {work.occurrences > 1 && work.id.startsWith("incident:") ? (
          <span className="wq-count">{work.occurrences}×</span>
        ) : work.occurrences > 1 ? (
          <span className="wq-count">+{work.occurrences - 1} more</span>
        ) : null}
      </div>
      <p className="wq-request">
        {work.kindLabel ? <span className="wq-kind">{work.kindLabel}</span> : null}
        {work.kindLabel && work.request ? " · " : ""}
        {work.request}
      </p>
      <p className="wq-meta">
        <span>{ageLabel(work.createdAt, now)}</span>
        <span aria-hidden>·</span>
        <span className={impact ? "wq-impact" : ""}>{impact ? `${impact} at stake` : "No value estimate"}</span>
        {work.source.meta?.address ? (
          <>
            <span aria-hidden>·</span>
            <span className="wq-addr">{work.source.meta.address}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
