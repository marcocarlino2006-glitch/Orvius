"use client";

import Link from "next/link";
import { useState } from "react";
import { PlanCard, type Proposal } from "@/components/command-board";
import { JOB_OUTCOMES } from "@/lib/job-outcome";
import type { Outcome, OutcomeOption, OutcomeStage } from "@/lib/outcome";
import { isUncertain, sendWrite } from "@/lib/client-write";
import { formatWhen } from "@/lib/when";

const STATE_WORD: Record<OutcomeStage["state"], string> = {
  done: "Done",
  waiting: "Waiting",
  needs_you: "Needs you",
  blocked: "Blocked",
  failed: "Failed",
  unknown: "Not confirmed",
  not_yet: "Not yet",
  not_needed: "Skipped",
};

const ACTOR_WORD: Record<NonNullable<OutcomeStage["nextActor"]>, string> = {
  orvius: "Orvius",
  you: "You",
  teammate: "A teammate",
  technician: "Technician",
  customer: "Customer",
  provider: "Carrier",
};

const EXECUTION_WORD = { confirmed: "confirmed", failed: "failed", unknown: "unconfirmed" } as const;

const send = (url: string, method: "POST" | "PATCH", body: unknown) => sendWrite<Record<string, any>>(url, method, body);

const STALE_VIEW = "This view didn't refresh, so it may be behind. Reload the page before doing anything else here.";

/**
 * One request's outcome, stage by stage, with the decision it waits on. The
 * buttons go through the same plans and routes as everywhere else: a choice
 * here becomes a plan to approve, marking done records what happened, and a
 * bill is sent only when the owner says so.
 */
export function OutcomeCard({ outcome, onChange }: { outcome: Outcome; onChange: (next: Outcome | null) => void }) {
  const [plan, setPlan] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* After a send nobody can confirm, or a refresh that failed, the send button stays away until a fresh view says otherwise. */
  const [holdBill, setHoldBill] = useState(false);
  const byStage = new Map(outcome.stages.map((s) => [s.stage, s]));
  const invoice = byStage.get("invoice")!;
  const completion = byStage.get("completion")!;
  const jobId = outcome.jobId;

  /** True when a fresh view arrived; otherwise the card says it may be behind instead of inviting a repeat. */
  async function reload(): Promise<boolean> {
    if (!jobId) return false;
    try {
      const res = await fetch(`/api/work/outcome?kind=job&id=${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.outcome) {
        setHoldBill(false);
        onChange(data.outcome);
        return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  }

  async function choose(option: OutcomeOption) {
    if (option.kind === "link") return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const body = option.kind === "assign_tech" ? { action: "assign_tech", jobId: option.jobId, technicianId: option.technicianId } : { action: "reschedule", jobId: option.jobId, at: option.at };
      const data = await send("/api/copilot", "POST", body);
      setPlan({ proposalId: data.proposalId, preview: data.preview });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't accepted.");
    } finally {
      setBusy(false);
    }
  }

  async function sendBill() {
    if (!jobId || !outcome.money.totalCents) return;
    setBusy(true);
    setError(null);
    setNote(null);
    let sent = false;
    try {
      await send(`/api/jobs/${jobId}/invoice`, "POST", { totalCents: outcome.money.totalCents, send: true });
      sent = true;
    } catch (err) {
      if (isUncertain(err)) setHoldBill(true);
      setError(err instanceof Error ? err.message : "The bill wasn't accepted.");
    }
    if (sent && !(await reload())) {
      setHoldBill(true);
      setNote(`The bill was handed to the carrier. ${STALE_VIEW} Don't send it again from here.`);
    }
    setBusy(false);
  }

  /* A bill still waiting on the carrier's receipt is not offered again; only a send nobody can confirm, after the owner checks. */
  const billable = !holdBill && (invoice.state === "failed" || invoice.state === "needs_you" || (invoice.state === "unknown" && invoice.nextActor === "you")) && Boolean(outcome.money.totalCents);
  const canComplete = Boolean(jobId) && completion.state !== "done" && completion.state !== "not_needed" && outcome.job?.status !== "cancelled";

  return (
    <section className="cb-oc" aria-label={`Where ${outcome.customer ?? "this request"} stands`}>
      <header className="cb-oc-head">
        <p className="cb-oc-headline">{outcome.headline}</p>
        <p className="cb-oc-sub">
          {outcome.customer ? `${outcome.customer} · ` : ""}
          {outcome.title}
          {outcome.synthetic ? " · Demo: nothing here reached a real customer" : null}
        </p>
      </header>
      <ol className="cb-oc-stages">
        {outcome.stages.map((s) => (
          <li key={s.stage} className={`cb-oc-stage is-${s.state}`}>
            <span className="cb-oc-label">{s.label}</span>
            <span className="cb-oc-state">{STATE_WORD[s.state]}</span>
            {s.evidence ? <span className="cb-oc-evidence">{s.evidence}</span> : null}
            {s.blocker ? (
              <span className="cb-oc-blocker">
                {s.blocker}
                {s.setupHref ? (
                  <>
                    {" "}
                    <Link href={s.setupHref}>{s.setupHref.startsWith("/dashboard/team") ? "Fix in Team →" : "Fix in settings →"}</Link>
                  </>
                ) : null}
              </span>
            ) : null}
            {s.nextAction && (s.state !== "done" || s.nextActor === "you") ? (
              <span className="cb-oc-next">
                {s.nextActor ? `${ACTOR_WORD[s.nextActor]}: ` : ""}
                {s.nextAction}
              </span>
            ) : null}
            {s.at && s.state !== "not_yet" ? (
              <span className="cb-oc-meta">
                {formatWhen(s.at)} · {s.source}
                {s.execution ? ` · ${EXECUTION_WORD[s.execution]}` : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {outcome.next?.options.length && !plan ? (
        <div className="cb-oc-decide">
          <p className="cb-oc-ask">Booking is kept. Who goes?</p>
          <div className="cb-slots">
            {outcome.next.options.map((o) =>
              o.kind === "link" ? (
                <Link key={o.href} href={o.href} className="ox-btn ox-btn--quiet ox-btn--sm" title={o.note}>
                  {o.label}
                </Link>
              ) : (
                <button key={`${o.kind}:${o.kind === "assign_tech" ? o.technicianId : o.at}`} type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} title={o.note} onClick={() => void choose(o)}>
                  {o.label}
                  <span className="cb-oc-note">{o.note}</span>
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
      {plan ? (
        <PlanCard
          proposal={plan}
          onResult={(result) => setNote(result.text)}
          onDone={() => {
            setPlan(null);
            void reload().then((fresh) => {
              if (!fresh) setNote((prev) => `${prev ? `${prev} ` : ""}${STALE_VIEW}`);
            });
          }}
        />
      ) : null}
      {canComplete && !holdBill ? (
        <CompleteForm
          jobId={jobId!}
          onSitePath={outcome.job?.status === "on_site"}
          onDone={(next) => {
            if (next) return onChange(next);
            /* Recorded, but the reply carried no fresh view: don't leave "Record it done" up to be pressed twice. */
            setHoldBill(true);
            void reload().then((fresh) => {
              if (!fresh) setNote(`Recorded as done. ${STALE_VIEW}`);
            });
          }}
        />
      ) : null}
      {billable ? (
        <div className="cb-actions">
          <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void sendBill()}>
            {invoice.state === "unknown" ? "I checked with them — send the bill again" : invoice.state === "failed" && outcome.money.billedCents ? "Resend the bill" : "Create and send the bill"}
          </button>
        </div>
      ) : null}
      {note ? (
        <p className="cb-oc-sub" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="cb-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const CORRECTION_SOURCES: { value: string; label: string }[] = [
  { value: "technician_report", label: "The technician told me" },
  { value: "customer_confirmed", label: "The customer confirmed it" },
  { value: "paper_ticket", label: "Paper ticket" },
  { value: "owner_report", label: "I did it myself" },
];

/** Marking work done from Command: what happened and the total, from a person. Orvius never infers it. */
function CompleteForm({ jobId, onSitePath, onDone }: { jobId: string; onSitePath: boolean; onDone: (next: Outcome | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [noCharge, setNoCharge] = useState(false);
  const [source, setSource] = useState("technician_report");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <div className="cb-actions">
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOpen(true)}>
          Record it done
        </button>
      </div>
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
      const data = await send(`/api/jobs/${jobId}`, "PATCH", {
        status: "completed",
        reason: onSitePath ? undefined : reason,
        completion: {
          path: onSitePath ? "field" : "correction",
          resolutionCode: code,
          ...(noCharge ? { noCharge: true } : { finalAmountCents: Number.isFinite(cents) ? cents : null }),
          ...(onSitePath ? {} : { evidenceSource: source }),
        },
      });
      onDone(data.outcome ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cb-oc-form" onSubmit={(e) => void submit(e)}>
      <label>
        What happened
        <select value={code} onChange={(e) => setCode(e.target.value)} required>
          <option value="">Choose…</option>
          {JOB_OUTCOMES.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Final amount
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={noCharge} placeholder="$0.00" required={!noCharge} />
      </label>
      <label className="cb-oc-check">
        <input type="checkbox" checked={noCharge} onChange={(e) => setNoCharge(e.target.checked)} /> No charge
      </label>
      {onSitePath ? null : (
        <>
          <label>
            How you know
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {CORRECTION_SOURCES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Why it wasn&apos;t marked on site
            <input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} />
          </label>
        </>
      )}
      {error ? (
        <p className="cb-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cb-actions">
        <button type="submit" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy || !code}>
          {busy ? "Saving…" : "Mark done"}
        </button>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
