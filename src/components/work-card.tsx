"use client";

import Link from "next/link";
import { useState } from "react";
import { PlanCard, type Proposal } from "@/components/command-board";
import { JobStatusAdvance } from "@/components/job-status-advance";
import { TestAlertButton } from "@/components/test-alert-button";
import { WorkHistoryLoader } from "@/components/work-history-view";
import { toast } from "@/components/toaster";
import type { BoardItem } from "@/lib/command-board";
import type { WorkItem, WorkSeverity } from "@/lib/work";
import { formatWhen } from "@/lib/when";

async function send(url: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "That did not work");
  return data as Record<string, unknown>;
}

const SEVERITY_CLASS: Record<WorkSeverity, string> = { critical: "wc-tag--critical", high: "wc-tag--high", med: "wc-tag--med" };

const WAITING_LABEL = { customer: "Waiting on the customer", technician: "With the technician" } as const;

const JOB_STATUS_FOR_STAGE: Partial<Record<WorkItem["stage"], string>> = {
  on_the_way: "en_route",
  on_site: "on_site",
};

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * One piece of work with what is wrong, what happens next, and the buttons
 * that do it. Command and the Work screen render the same card, so a problem
 * reads the same wherever the owner meets it.
 */
export function WorkCard({
  item,
  approval,
  technicians,
  onChange,
  variant = "list",
}: {
  item: WorkItem;
  approval?: BoardItem | null;
  technicians: Array<{ id: string; name: string }>;
  onChange: () => void;
  /** On the work's own page the title, owner and history are already on screen. */
  variant?: "list" | "page";
}) {
  const inList = variant === "list";
  const [open, setOpen] = useState<"history" | "slots" | null>(null);
  const [slots, setSlots] = useState<{ action: string; windows: { at: string; label: string }[] } | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(
    approval?.proposalId ? { proposalId: approval.proposalId, preview: approval.preview ?? approval.title } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const loadSlots = () =>
    run(async () => {
      const q = item.kind === "job" ? `jobId=${item.id}` : `leadId=${item.id}`;
      const res = await fetch(`/api/command/slots?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the schedule");
      setSlots(data);
      setOpen("slots");
    });

  const propose = (at: string) =>
    run(async () => {
      const data = await send("/api/copilot", "POST", { action: slots!.action, at, ...(item.kind === "job" ? { jobId: item.id } : { leadId: item.id }) });
      setProposal({ proposalId: String(data.proposalId), preview: String(data.preview) });
      setOpen(null);
    });

  const setJob = (body: Record<string, unknown>, done: string) =>
    run(async () => {
      await send(`/api/jobs/${item.id}`, "PATCH", body);
      toast({ title: done });
      onChange();
    });

  const textConfirm = () =>
    run(async () => {
      const res = await fetch(`/api/jobs/${item.id}/confirm-sms`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send the confirmation");
      toast({ title: "Confirmation text sent" });
      onChange();
    });

  const takeover = () =>
    run(async () => {
      await send("/api/command/takeover", "POST", { leadId: item.leadId ?? undefined, phone: item.leadId ? undefined : item.phone, release: item.takenOver });
      toast({ title: item.takenOver ? "Handed back to Orvius" : "You have this conversation — Orvius stopped texting them" });
      onChange();
    });

  const top = item.problems[0] ?? null;
  const kinds = new Set(item.problems.map((p) => p.kind));
  const isJob = item.kind === "job";
  const late = kinds.has("stale") || kinds.has("tech_no_show");
  const needsTech = isJob && item.nextAction === "Assign a technician";
  const canMove = item.stage === "needs_callback" || item.stage === "needs_time" || (isJob && (item.stage === "scheduled" || item.stage === "confirmed"));
  const primaryCall = Boolean(item.phone) && (item.stage === "needs_callback" || kinds.has("emergency") || kinds.has("unconfirmed_soon") || kinds.has("failed_message") || kinds.has("customer_no_show") || kinds.has("open_invoice") || kinds.has("estimate_failed") || kinds.has("wants_human"));
  const who = item.customer?.trim() || item.phone || "Unknown caller";
  const unconfirmed = isJob && (item.stage === "scheduled" || kinds.has("unconfirmed_soon")) && Boolean(item.technician) && !kinds.has("failed_message");
  const fieldStatus = isJob && !late ? JOB_STATUS_FOR_STAGE[item.stage] : undefined;

  return (
    <li className={`wc${inList ? "" : " wc--page"}${top ? ` wc--${top.severity}` : item.urgent ? " wc--high" : ""}`}>
      <div className="wc-head">
        <div className="wc-main">
          <p className="wc-tags">
            {item.problems.map((p) => (
              <span key={p.kind} className={`wc-tag ${SEVERITY_CLASS[p.severity]}`}>
                {p.label}
              </span>
            ))}
            {item.urgent && !kinds.has("emergency") ? <span className="wc-tag wc-tag--high">Urgent</span> : null}
            {item.takenOver ? <span className="wc-tag wc-tag--you">You have the texts</span> : null}
            <span className="wc-stage">{item.stageLabel}</span>
          </p>
          {inList ? (
            <Link href={item.href} className="wc-title">
              {item.title}
              <span className="wc-who"> · {who}</span>
            </Link>
          ) : null}
          <p className="wc-detail">
            {top?.detail ?? item.nextAction ?? (item.waitingOn === "customer" || item.waitingOn === "technician" ? WAITING_LABEL[item.waitingOn] : "Nothing to do")}
          </p>
          {top && item.nextAction ? <p className="wc-next">Next: {item.nextAction}</p> : null}
        </div>
        <div className="wc-meta" hidden={!inList}>
          {item.scheduledAt ? <span className="wc-when">{formatWhen(item.scheduledAt)}</span> : <span className="wc-when">{formatWhen(item.createdAt)}</span>}
          <span className="wc-owner">{item.responsible.label}</span>
        </div>
      </div>

      {proposal ? (
        <PlanCard
          proposal={proposal}
          onDone={() => {
            setProposal(null);
            onChange();
          }}
        />
      ) : (
        <div className="wc-actions">
          {primaryCall && item.phone ? (
            <a href={tel(item.phone)} className="ox-btn ox-btn--primary ox-btn--sm">
              Call {item.customer?.split(" ")[0] || "them"}
            </a>
          ) : null}
          {needsTech && technicians.length ? (
            <label className="wc-assign">
              <span className="sr-only">Assign a technician to {item.title}</span>
              <select
                className="wc-select"
                defaultValue=""
                disabled={busy}
                onChange={(e) => e.target.value && void setJob({ technicianId: e.target.value }, "Technician assigned")}
              >
                <option value="">Assign a technician…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {unconfirmed && item.waitingOn !== "customer" ? (
            <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void textConfirm()}>
              Text a confirmation
            </button>
          ) : null}
          {kinds.has("alert_failed") ? <TestAlertButton onDone={onChange} /> : null}
          {fieldStatus ? <JobStatusAdvance jobId={item.id} status={fieldStatus} onAdvanced={() => onChange()} compact /> : null}
          {canMove ? (
            <button
              type="button"
              className={`ox-btn ${!primaryCall && !needsTech && !late && !unconfirmed ? "ox-btn--primary" : "ox-btn--quiet"} ox-btn--sm`}
              disabled={busy}
              onClick={() => (open === "slots" ? setOpen(null) : void loadSlots())}
            >
              {isJob ? (late ? "Move it" : "Change the time") : "Offer a time"}
            </button>
          ) : null}
          {isJob && late ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void setJob({ status: "completed" }, "Marked done")}>
              Mark done
            </button>
          ) : null}
          {isJob && item.technician?.phone && (late || item.stage === "on_the_way" || item.stage === "on_site") ? (
            <a href={tel(item.technician.phone)} className="ox-btn ox-btn--quiet ox-btn--sm">
              Call {item.technician.name.split(" ")[0]}
            </a>
          ) : null}
          {inList ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOpen(open === "history" ? null : "history")}>
              {open === "history" ? "Hide history" : "History"}
            </button>
          ) : null}
          {inList ? (
            <Link href={item.href} className="ox-btn ox-btn--quiet ox-btn--sm">
              Open
            </Link>
          ) : null}
          {item.phone ? (
            <details className="wc-more">
              <summary className="ox-btn ox-btn--quiet ox-btn--sm" aria-label={`More for ${item.title}`}>
                More
              </summary>
              <div className="wc-more-menu" role="menu">
                {!primaryCall ? (
                  <a role="menuitem" href={tel(item.phone)} className="wc-more-item">
                    Call {item.customer?.split(" ")[0] || "the customer"}
                  </a>
                ) : null}
                {unconfirmed && item.waitingOn === "customer" ? (
                  <button role="menuitem" type="button" className="wc-more-item" disabled={busy} onClick={() => void textConfirm()}>
                    Resend the confirmation text
                  </button>
                ) : null}
                <button role="menuitem" type="button" className="wc-more-item" disabled={busy} onClick={() => void takeover()}>
                  {item.takenOver ? "Hand texts back to Orvius" : "Take over texts from Orvius"}
                </button>
              </div>
            </details>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="cb-error" role="alert">
          {error}
        </p>
      ) : null}

      {open === "slots" && slots ? (
        <div className="cb-slots">
          {slots.windows.length ? (
            <>
              <p className="cb-muted">Open on the real schedule — Orvius drafts the change, you approve it:</p>
              {slots.windows.map((w) => (
                <button key={w.at} type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void propose(w.at)}>
                  {w.label}
                </button>
              ))}
            </>
          ) : (
            <p className="cb-muted">Nothing is open in the next two weeks for this work.</p>
          )}
        </div>
      ) : null}
      {open === "history" ? <WorkHistoryLoader kind={item.kind} id={item.id} /> : null}
    </li>
  );
}
