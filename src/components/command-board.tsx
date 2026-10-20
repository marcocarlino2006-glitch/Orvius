"use client";

import { askConfirm } from "@/components/ask-dialog";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OutcomeCard } from "@/components/outcome-card";
import { toast } from "@/components/toaster";
import type { Outcome } from "@/lib/outcome";
import type { RequestTrace } from "@/lib/request-trace";
import { isUncertain, sendWrite } from "@/lib/client-write";
import { describeReadBack, readCancelReply, readExecuteReply, readReadBack } from "@/lib/plan-reply";
import { formatWhen } from "@/lib/when";

type Scenario = { id: string; label: string; expect: string };
export type Proposal = { proposalId: string; preview: string };
type AskResult =
  | { kind: "proposal"; proposal: Proposal; message: string }
  | { kind: "choices"; message: string; options: { label: string; action: string; at: string; leadId?: string; jobId?: string }[] }
  | { kind: "answer"; message: string; records?: { href: string; title: string; summary: string }[] }
  | { kind: "refused" | "clarify"; message: string };

export type PlanOutcome = { ok: boolean; text: string; outcome?: Outcome | null };

const post = <T = Record<string, any>>(url: string, body: unknown) => sendWrite<T>(url, "POST", body);

export function PlanCard({
  proposal,
  onDone,
  onResult,
}: {
  proposal: Proposal;
  onDone: () => void;
  /** Lets the caller keep the outcome on screen instead of only a toast. */
  onResult?: (outcome: PlanOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* After a reply nobody can trust, Approve stays away until the shop's record says the plan never took effect. */
  const [unsure, setUnsure] = useState(false);
  function finish(outcome: PlanOutcome) {
    if (onResult) onResult(outcome);
    else toast({ title: outcome.text });
    onDone();
  }
  async function checkRecord() {
    setBusy(true);
    try {
      const res = await fetch(`/api/copilot?proposalId=${encodeURIComponent(proposal.proposalId)}`, { cache: "no-store" });
      const found = res.ok ? readReadBack(await res.json().catch(() => null), proposal.proposalId) : null;
      if (!found) {
        setError("Orvius couldn't read where this plan stands. It won't run again from here; check again in a moment.");
        return;
      }
      const told = describeReadBack(found.state);
      if (found.state === "done") return finish({ ok: true, text: told.text, outcome: found.outcome });
      if (found.state === "withdrawn") return finish({ ok: false, text: told.text, outcome: null });
      if (told.settled) {
        toast({ title: told.text });
        return onDone();
      }
      setError(told.text);
      if (told.canApprove) setUnsure(false);
    } catch {
      setError("Orvius couldn't read where this plan stands. It won't run again from here; check again in a moment.");
    } finally {
      setBusy(false);
    }
  }
  async function act(mode: "execute" | "cancel") {
    setBusy(true);
    setError(null);
    let readBack = false;
    try {
      const data = await post(`/api/copilot?mode=${mode}`, mode === "execute" ? { proposalId: proposal.proposalId, approved: true } : { proposalId: proposal.proposalId });
      if (mode === "execute") {
        const reply = readExecuteReply(data, proposal.proposalId);
        if (reply) return finish({ ok: true, text: reply.summary, outcome: reply.outcome });
      } else if (readCancelReply(data, proposal.proposalId)) {
        return finish({ ok: false, text: "Dismissed. Nothing changed.", outcome: null });
      }
      readBack = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't accepted.");
      if (isUncertain(err)) readBack = true;
      else if (err instanceof Error && /flagged in Command/.test(err.message)) onDone();
    } finally {
      setBusy(false);
    }
    if (readBack) {
      setUnsure(true);
      await checkRecord();
    }
  }
  return (
    <div className="cb-plan">
      <p className="cb-plan-kicker">Plan — nothing changes until you approve</p>
      <p className="cb-plan-text">{proposal.preview}</p>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-actions">
        {unsure ? (
          <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void checkRecord()}>
            {busy ? "Checking…" : "Check what happened"}
          </button>
        ) : (
          <>
            <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void act("execute")}>
              {busy ? "Working…" : "Approve"}
            </button>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void act("cancel")}>
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** An approval that stopped partway or couldn't be recorded: a person says whether it happened. Never re-runs it. */
export function CheckCard({
  proposalId,
  title,
  detail,
  done,
  onDone,
}: {
  proposalId: string;
  title: string;
  detail: string;
  done: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resolve(outcome: "done" | "not_done") {
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/copilot?mode=resolve", { proposalId, outcome });
      if (data.ok !== true) {
        setError("The answer didn't come back readable, so this may or may not be saved. Refresh before answering again.");
        return;
      }
      toast({
        title:
          outcome === "done"
            ? data.recorded === false
              ? "Marked as done. The note for the history didn't save."
              : "Marked as done."
            : "Back in approvals. Approve it again when you're ready.",
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cb-plan">
      <p className="cb-plan-kicker">{done ? "Went through, not recorded" : "Check this: it stopped partway"}</p>
      <p className="cb-plan-text">{title}</p>
      <p className="cb-plan-text">{detail}</p>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-actions">
        <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void resolve("done")}>
          {done ? "Confirm it happened" : "It happened"}
        </button>
        {done ? null : (
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void resolve("not_done")}>
            It didn&apos;t happen
          </button>
        )}
      </div>
    </div>
  );
}

export function TraceView({ leadId }: { leadId: string }) {
  const [trace, setTrace] = useState<RequestTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/command/trace?leadId=${encodeURIComponent(leadId)}`)
      .then(async (res) => (res.ok ? setTrace(await res.json()) : setError("Trace could not load")))
      .catch(() => setError("Trace could not load"));
  }, [leadId]);
  if (error) return <p className="cb-error">{error}</p>;
  if (!trace) return <p className="cb-muted">Reading the trail…</p>;
  return (
    <ol className="cb-trace" aria-label="Request trace">
      {trace.events.map((e) => (
        <li key={e.id} className={`cb-trace-row cb-tone-${e.tone}`}>
          <span className="cb-trace-dot" aria-hidden />
          <span className="cb-trace-title">
            {e.title}
            {e.simulated ? <em className="cb-sim"> simulated</em> : null}
          </span>
          <time className="cb-trace-at" dateTime={e.at}>
            {formatWhen(e.at)} · {e.actor}
          </time>
        </li>
      ))}
    </ol>
  );
}

const ASK_STARTERS: { label: string; text: string; icon: string }[] = [
  { label: "Book a job", text: "Book ", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14v4M10 16h4" },
  { label: "Move a job", text: "Move ", icon: "M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" },
  { label: "Send a tech", text: "Send ", icon: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
];

function AskIcon({ d }: { d: string }) {
  return (
    <svg className="cb-ask-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const SESSION_STEPS = ["Reading shop records…", "Checking calls, jobs and money…", "Putting the answer together…"];

/** The line is working. The words change so the wait is something you can see. */
function SessionThinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, SESSION_STEPS.length - 1)), 900);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="cb-ask-live" role="status">
      <span className="ask-live-dot" aria-hidden />
      {SESSION_STEPS[step]}
    </p>
  );
}

/** The answer arrives in place. A click, or reduced motion, shows the whole line. */
function SessionReveal({ text, onDone }: { text: string; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || text.length < 48) {
      setShown(text.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const step = Math.max(2, Math.ceil(text.length / 70));
    const id = window.setInterval(() => {
      setShown((current) => {
        const next = Math.min(text.length, current + step);
        if (next >= text.length) {
          window.clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone();
          }
        }
        return next;
      });
    }, 16);
    return () => window.clearInterval(id);
    // The finish callback is owned by this turn; re-running it would restart the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const typing = shown < text.length;
  return (
    <p
      className="cb-turn-a"
      onClick={() => {
        if (!typing) return;
        setShown(text.length);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }}
    >
      {text.slice(0, shown)}
      {typing ? <span className="ask-caret" aria-hidden /> : null}
    </p>
  );
}

type SessionTurn = {
  id: number;
  question: string;
  status: "pending" | "done";
  result?: AskResult;
  revealed?: boolean;
  outcome?: PlanOutcome | null;
};

/**
 * The line under the decision. A turn stays on the page: the question, the
 * wait, then the answer. Nothing on the schedule changes from typing alone.
 */
export function AskBar({ onChange, below }: { onChange: () => void; below?: ReactNode }) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<SessionTurn[]>([]);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((turn) => turn.status === "pending");

  function start(prefix: string) {
    setText(prefix);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefix.length, prefix.length);
    });
  }

  function settle(id: number, result: AskResult) {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, status: "done", result, revealed: false } : turn)));
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const question = text.trim();
    if (busy || question.length < 2) return;
    const id = nextId.current++;
    setText("");
    setTurns((current) => [...current, { id, question, status: "pending" }]);
    try {
      settle(id, await post<AskResult>("/api/command/ask", { text: question }));
    } catch (err) {
      settle(id, { kind: "refused", message: err instanceof Error ? err.message : "That didn't go through — nothing changed" });
    }
  }

  async function pick(id: number, option: { action: string; at: string; leadId?: string; jobId?: string }) {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, status: "pending", result: undefined, revealed: false } : turn)));
    try {
      const data = await post("/api/copilot", option);
      settle(id, { kind: "proposal", proposal: { proposalId: data.proposalId, preview: data.preview }, message: "Here's the plan." });
    } catch (err) {
      settle(id, { kind: "refused", message: err instanceof Error ? err.message : "That didn't go through — nothing changed" });
    }
  }

  function reveal(id: number) {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, revealed: true } : turn)));
  }

  return (
    <div className="cb-ask">
      {turns.map((turn) => {
        const result = turn.result;
        return (
          <article key={turn.id} className="cb-turn">
            <p className="cb-turn-q">{turn.question}</p>
            {turn.status === "pending" ? <SessionThinking /> : null}
            {result ? (
              <div className="cb-ask-result" role="status">
                <SessionReveal text={result.message} onDone={() => reveal(turn.id)} />
                {turn.revealed && result.kind === "choices" ? (
                  <div className="cb-slots">
                    {result.options.map((o) => (
                      <button key={o.at} type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void pick(turn.id, o)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {turn.revealed && result.kind === "answer" && result.records?.length ? (
                  <ul className="cb-records">
                    {result.records.map((r) => (
                      <li key={r.href}>
                        <a href={r.href} className="cb-record">
                          <span className="cb-record-title">{r.title}</span>
                          <span className="cb-record-sum">{r.summary}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {turn.revealed && result.kind === "proposal" && !turn.outcome ? (
                  <>
                    <ol className="cb-steps" aria-label="Progress">
                      <li className="is-done">Proposed change</li>
                      <li className="is-now">Your approval</li>
                      <li>Result</li>
                    </ol>
                    <PlanCard
                      proposal={result.proposal}
                      onResult={(outcome) => setTurns((current) => current.map((item) => (item.id === turn.id ? { ...item, outcome } : item)))}
                      onDone={() => onChange()}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
            {turn.outcome ? (
              <div className={`cb-outcome${turn.outcome.ok ? " is-ok" : ""}`} role="status">
                <ol className="cb-steps" aria-label="Progress">
                  <li className="is-done">Proposed change</li>
                  <li className="is-done">{turn.outcome.ok ? "Approved" : "Dismissed"}</li>
                  <li className="is-done">Result</li>
                </ol>
                <p className="cb-outcome-text">{turn.outcome.text}</p>
                {turn.outcome.outcome ? (
                  <OutcomeCard
                    outcome={turn.outcome.outcome}
                    onChange={(next) =>
                      setTurns((current) =>
                        current.map((item) => (item.id === turn.id && item.outcome ? { ...item, outcome: { ...item.outcome, outcome: next } } : item)),
                      )
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      <div className="cb-ask-stack">
        <form className="cb-ask-form" onSubmit={(e) => void ask(e)}>
          <label className="sr-only" htmlFor="cb-ask-input">
            Ask Orvius to book, move, assign, or check work
          </label>
          <textarea
            id="cb-ask-input"
            ref={inputRef}
            className="cb-ask-input"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder="Ask Orvius to book, move, assign, or check work."
            autoComplete="off"
          />
          <div className="cb-ask-bar">
            {text.trim() || turns.length || busy ? (
              <span className="cb-ask-note">
                <AskIcon d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                Nothing changes until you approve
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="cb-ask-send"
              aria-label={busy ? "Checking…" : "Plan it"}
              title="Plan it"
              disabled={busy || text.trim().length < 2}
            >
              <AskIcon d="M12 19V5M5 12l7-7 7 7" />
            </button>
          </div>
        </form>
        {below}
      </div>
      <div className="cb-ask-chips" aria-label="Start with">
        {ASK_STARTERS.map((s) => (
          <button key={s.label} type="button" className="cb-ask-chip" onClick={() => start(s.text)}>
            <AskIcon d={s.icon} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DemoPanel({ onChange }: { onChange: () => void }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/command/simulate")
      .then((res) => res.json())
      .then((data) => setScenarios(data.scenarios ?? []))
      .catch(() => undefined);
  }, []);
  async function run(id: string) {
    setBusy(id);
    try {
      const data = await post("/api/command/simulate", { scenario: id });
      toast({
        title: data.autoBooked
          ? "Call captured and a window proposed"
          : `Call captured — ${String(data.skipReason ?? "held for you").replace(/_/g, " ")}`,
      });
      onChange();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Simulation failed" });
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="cb-demo" aria-label="Simulate a call">
      <p className="cb-demo-title">Place a call</p>
      <p className="cb-muted">Runs the same pipeline as a live line.</p>
      <div className="cb-demo-grid">
        {scenarios.map((s) => (
          <button key={s.id} type="button" className="cb-demo-btn" disabled={Boolean(busy)} onClick={() => void run(s.id)} title={s.expect}>
            <span className="cb-demo-label">{busy === s.id ? "Calling…" : s.label}</span>
            <span className="cb-demo-expect">{s.expect}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

async function openDemo(reset: boolean) {
  await post("/api/demo/workspace", { reset, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  window.location.assign("/dashboard");
}

export function TryDemo({ empty }: { empty: boolean }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      await openDemo(false);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not open the demo" });
      setBusy(false);
    }
  }
  return (
    <p className="cb-try">
      {empty ? "No calls yet. " : ""}
      <button type="button" className="cb-try-link" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening…" : "Open a practice shop"}
      </button>
      {" "}— dated today, separate from this one.
    </p>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** On a demo shop: what it is, how old its sample week is, a reset, and simulated calls. */
export function DemoWorkspaceBar({ sampleFrom, onChange }: { sampleFrom: string | null | undefined; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const from = sampleFrom ? new Date(sampleFrom) : null;
  const stale = Boolean(from && Date.now() - from.getTime() > DAY_MS);
  async function reset() {
    const again = await askConfirm({
      title: "Start the demo over at today's date?",
      body: "Everything you did in this demo shop is cleared. Your real shop is not touched.",
      confirmLabel: "Start over",
    });
    if (!again) return;
    setBusy(true);
    try {
      await openDemo(true);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not reset the demo" });
      setBusy(false);
    }
  }
  return (
    <section className={`cb-demo-bar${stale ? " is-stale" : ""}`} aria-label="Demo shop">
      <div className="cb-demo-bar-copy">
        <p className="cb-demo-title">{stale ? "This morning is out of date" : "The day is on the board"}</p>
        <p className="cb-muted">
          {stale && from
            ? `Dated from ${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Reset to start at today.`
            : "Requests, today's crew, bills and payments. Reset any time for a fresh morning."}
        </p>
      </div>
      <div className="cb-demo-bar-actions">
        <button type="button" className={`ox-btn ${stale ? "ox-btn--primary" : "ox-btn--quiet"} ox-btn--sm`} disabled={busy} onClick={() => void reset()}>
          {busy ? "Resetting…" : "Reset to today"}
        </button>
      </div>
      <DemoPanel onChange={onChange} />
    </section>
  );
}
