"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/components/toaster";
import type { RequestTrace } from "@/lib/request-trace";
import { formatWhen } from "@/lib/when";

type Scenario = { id: string; label: string; expect: string };
export type Proposal = { proposalId: string; preview: string };
type AskResult =
  | { kind: "proposal"; proposal: Proposal; message: string }
  | { kind: "choices"; message: string; options: { label: string; action: string; at: string; leadId?: string; jobId?: string }[] }
  | { kind: "answer"; message: string; records?: { href: string; title: string; summary: string }[] }
  | { kind: "refused" | "clarify"; message: string };

export type PlanOutcome = { ok: boolean; text: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That did not work");
  return data;
}

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
  async function act(mode: "execute" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/copilot?mode=${mode}`, mode === "execute" ? { proposalId: proposal.proposalId, approved: true } : { proposalId: proposal.proposalId });
      const text = mode === "execute" ? (data.confirmation?.summary ?? "Done") : "Dismissed. Nothing changed.";
      if (onResult) onResult({ ok: mode === "execute", text });
      else toast({ title: text });
      onDone();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "That did not work"}. Nothing changed.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cb-plan">
      <p className="cb-plan-kicker">Plan — nothing changes until you approve</p>
      <p className="cb-plan-text">{proposal.preview}</p>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-actions">
        <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void act("execute")}>
          {busy ? "Working…" : "Approve"}
        </button>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void act("cancel")}>
          Dismiss
        </button>
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

/**
 * The composer at the top of Command. Every ask ends in a plan to approve or a
 * plain question; nothing on the schedule changes from typing alone.
 */
export function AskBar({ onChange, below }: { onChange: () => void; below?: ReactNode }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function start(prefix: string) {
    setText(prefix);
    setResult(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefix.length, prefix.length);
    });
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || text.trim().length < 2) return;
    setBusy(true);
    setOutcome(null);
    try {
      setResult(await post("/api/command/ask", { text }));
    } catch (err) {
      setResult({ kind: "refused", message: err instanceof Error ? err.message : "That did not work" });
    } finally {
      setBusy(false);
    }
  }

  async function pick(option: { action: string; at: string; leadId?: string; jobId?: string }) {
    setBusy(true);
    try {
      const data = await post("/api/copilot", option);
      setResult({ kind: "proposal", proposal: { proposalId: data.proposalId, preview: data.preview }, message: "Here's the plan." });
    } catch (err) {
      setResult({ kind: "refused", message: err instanceof Error ? err.message : "That did not work" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cb-ask">
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
            <span className="cb-ask-note">
              <AskIcon d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              Nothing changes until you approve
            </span>
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
      {result ? (
        <div className="cb-ask-result" role="status">
          <p className="cb-ask-message">{result.message}</p>
          {result.kind === "choices" ? (
            <div className="cb-slots">
              {result.options.map((o) => (
                <button key={o.at} type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void pick(o)}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
          {result.kind === "answer" && result.records?.length ? (
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
          {result.kind === "proposal" ? (
            <>
              <ol className="cb-steps" aria-label="Progress">
                <li className="is-done">Proposed change</li>
                <li className="is-now">Your approval</li>
                <li>Result</li>
              </ol>
              <PlanCard
                proposal={result.proposal}
                onResult={setOutcome}
                onDone={() => {
                  setResult(null);
                  setText("");
                  onChange();
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {outcome ? (
        <div className={`cb-outcome${outcome.ok ? " is-ok" : ""}`} role="status">
          <ol className="cb-steps" aria-label="Progress">
            <li className="is-done">Proposed change</li>
            <li className="is-done">{outcome.ok ? "Approved" : "Dismissed"}</li>
            <li className="is-done">Result</li>
          </ol>
          <p className="cb-outcome-text">{outcome.text}</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOutcome(null)}>
            Clear
          </button>
        </div>
      ) : null}
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
      <p className="cb-demo-title">Demo workspace — place a call</p>
      <p className="cb-muted">
        Runs the real pipeline. Texts are simulated — nothing reaches a real phone.
      </p>
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

export function TryDemo({ empty }: { empty: boolean }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      await post("/api/demo/workspace", {});
      window.location.assign("/dashboard");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not open the demo" });
      setBusy(false);
    }
  }
  return (
    <p className="cb-try">
      {empty ? "No calls yet. " : ""}
      <button type="button" className="cb-try-link" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening the demo shop…" : "Try it in a demo shop"}
      </button>
      {" "}— your real line and customers stay untouched.
    </p>
  );
}
