"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/components/toaster";
import type { BoardItem, BoardLane, CommandBoard as Board } from "@/lib/command-board";
import type { RequestTrace } from "@/lib/request-trace";
import { openSettings } from "@/lib/settings-center";
import { formatWhen } from "@/lib/when";

const LANES: { id: BoardLane; label: string; empty: string }[] = [
  { id: "approvals", label: "Needs your OK", empty: "Nothing is waiting on you." },
  { id: "exceptions", label: "Exceptions", empty: "No emergencies, failed texts, stale or duplicate jobs." },
  { id: "requests", label: "Requests", empty: "No open requests without a job." },
  { id: "proposed", label: "Proposed", empty: "No windows waiting on a customer." },
];

const EXCEPTION_LABEL: Record<string, string> = {
  emergency: "Safety",
  failed_message: "Failed text",
  alert_setup: "Alerts",
  unconfirmed_soon: "Unconfirmed",
  stale: "Stale",
  duplicate: "Duplicate",
  takeover: "You have it",
};

type Scenario = { id: string; label: string; expect: string };
type Proposal = { proposalId: string; preview: string };
type AskResult =
  | { kind: "proposal"; proposal: Proposal; message: string }
  | { kind: "choices"; message: string; options: { label: string; action: string; at: string; leadId?: string; jobId?: string }[] }
  | { kind: "refused" | "clarify"; message: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That did not work");
  return data;
}

function PlanCard({ proposal, onDone }: { proposal: Proposal; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(mode: "execute" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/copilot?mode=${mode}`, mode === "execute" ? { proposalId: proposal.proposalId, approved: true } : { proposalId: proposal.proposalId });
      toast({ title: mode === "execute" ? (data.confirmation?.summary ?? "Done") : "Dismissed" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
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

function TraceView({ leadId }: { leadId: string }) {
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

function ItemRow({ item, demo, onChange }: { item: BoardItem; demo: boolean; onChange: () => void }) {
  const [open, setOpen] = useState<"trace" | "slots" | null>(null);
  const [slots, setSlots] = useState<{ action: string; windows: { at: string; label: string }[] } | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(item.proposalId ? { proposalId: item.proposalId, preview: item.preview ?? item.title } : null);
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
      const q = item.jobId ? `jobId=${item.jobId}` : `leadId=${item.leadId}`;
      const res = await fetch(`/api/command/slots?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the schedule");
      setSlots(data);
      setOpen("slots");
    });

  const propose = (at: string) =>
    run(async () => {
      const data = await post("/api/copilot", { action: slots!.action, at, ...(item.jobId ? { jobId: item.jobId } : { leadId: item.leadId }) });
      setProposal({ proposalId: data.proposalId, preview: data.preview });
      setOpen(null);
    });

  const takeover = (release: boolean) =>
    run(async () => {
      await post("/api/command/takeover", { leadId: item.leadId ?? undefined, phone: item.leadId ? undefined : item.phone, release });
      toast({ title: release ? "Handed back to Orvius" : "You have this conversation — Orvius stopped texting them" });
      onChange();
    });

  const markDone = () =>
    run(async () => {
      const res = await fetch(`/api/jobs/${item.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not close the job");
      toast({ title: "Marked done" });
      onChange();
    });

  const confirmAsCustomer = () =>
    run(async () => {
      await post("/api/command/simulate", { confirmJobId: item.jobId });
      toast({ title: "Customer confirmed (simulated)" });
      onChange();
    });

  const canSchedule = (item.lane === "requests" && item.leadId) || ((item.lane === "proposed" || item.lane === "confirmed" || item.exception === "stale") && item.jobId);
  const canTake = Boolean((item.leadId || item.phone) && item.lane !== "approvals" && item.exception !== "alert_setup");

  return (
    <li className={`cb-item${item.urgent ? " cb-item--urgent" : ""}`}>
      <div className="cb-item-head">
        <div className="cb-item-main">
          <p className="cb-item-title">
            {item.exception ? <span className={`cb-tag cb-tag--${item.exception}`}>{EXCEPTION_LABEL[item.exception]}</span> : null}
            {item.urgent && !item.exception ? <span className="cb-tag cb-tag--emergency">Urgent</span> : null}
            {item.takenOver && item.exception !== "takeover" ? <span className="cb-tag cb-tag--takeover">You have it</span> : null}
            {item.title}
          </p>
          {item.lane !== "approvals" ? <p className="cb-item-detail">{item.detail}</p> : null}
        </div>
        <time className="cb-item-at" dateTime={item.at}>
          {formatWhen(item.at)}
        </time>
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
        <div className="cb-actions">
          {item.exception === "alert_setup" ? (
            <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" onClick={() => openSettings("notifications")}>
              Fix setup
            </button>
          ) : null}
          {canSchedule ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => (open === "slots" ? setOpen(null) : void loadSlots())}>
              {item.jobId ? "Move" : "Propose a time"}
            </button>
          ) : null}
          {item.exception === "stale" && item.jobId ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void markDone()}>
              Mark done
            </button>
          ) : null}
          {item.exception === "stale" && item.techPhone ? (
            <a href={`tel:${item.techPhone}`} className="ox-btn ox-btn--quiet ox-btn--sm">
              Call tech
            </a>
          ) : null}
          {demo && item.lane === "proposed" && item.jobId && item.confirm !== "failed" ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void confirmAsCustomer()}>
              Customer confirms
            </button>
          ) : null}
          {canTake ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void takeover(Boolean(item.takenOver))}>
              {item.takenOver ? "Hand back" : "Take over"}
            </button>
          ) : null}
          {item.leadId ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOpen(open === "trace" ? null : "trace")}>
              {open === "trace" ? "Hide trace" : "Trace"}
            </button>
          ) : null}
        </div>
      )}

      {error ? <p className="cb-error" role="alert">{error}</p> : null}

      {open === "slots" && slots ? (
        <div className="cb-slots">
          {slots.windows.length ? (
            <>
              <p className="cb-muted">Open on the real schedule:</p>
              {slots.windows.map((w) => (
                <button key={w.at} type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void propose(w.at)}>
                  {w.label}
                </button>
              ))}
            </>
          ) : (
            <p className="cb-muted">Nothing is open in the next two weeks for this job.</p>
          )}
        </div>
      ) : null}
      {open === "trace" && item.leadId ? <TraceView leadId={item.leadId} /> : null}
    </li>
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
            Ask Orvius to act
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
            placeholder="Book, move or assign a job — “book Maria tomorrow at 2”"
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
          {result.kind === "proposal" ? (
            <PlanCard
              proposal={result.proposal}
              onDone={() => {
                setResult(null);
                setText("");
                onChange();
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="cb-ask-chips" aria-label="Start with">
        {ASK_STARTERS.map((s) => (
          <button key={s.label} type="button" className="cb-ask-chip" onClick={() => start(s.text)}>
            <AskIcon d={s.icon} />
            {s.label}
          </button>
        ))}
        <Link href="/dashboard/inbox" className="cb-ask-chip">
          <AskIcon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          Open inbox
        </Link>
        <Link href="/dashboard/ask" className="cb-ask-chip">
          More
        </Link>
      </div>
    </div>
  );
}

function DemoPanel({ onChange }: { onChange: () => void }) {
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

function TryDemo({ empty }: { empty: boolean }) {
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

/**
 * Command's working surface: four lanes read from records, an ask bar that
 * only ever produces a plan to approve, and — in a demo workspace — scripted
 * calls that drive the real pipeline.
 */
export type ExtraLane = { id: string; label: string; count: number; content: ReactNode };

export function CommandBoard({ onChange, extra, refreshKey = 0 }: { onChange?: () => void; extra?: ExtraLane; refreshKey?: number }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lane, setLane] = useState<BoardLane | "extra" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/command/board");
      if (!res.ok) throw new Error();
      setBoard(await res.json());
      setError(null);
    } catch {
      setError("The board could not load. Your line keeps answering.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20_000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const refresh = useCallback(() => {
    void load();
    onChange?.();
  }, [load, onChange]);

  const active = useMemo<BoardLane | "extra">(() => {
    if (lane) return lane;
    if (!board) return "approvals";
    return LANES.find((l) => board.lanes[l.id].length)?.id ?? (extra?.count ? "extra" : "requests");
  }, [lane, board, extra?.count]);

  const demo = board?.environment === "demo";
  const empty = board ? LANES.every((l) => board.lanes[l.id].length === 0) : false;

  return (
    <section className="cb font-sans" aria-label="Today's board">
      {demo ? <DemoPanel onChange={refresh} /> : null}
      {error && !board ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-tabs" role="tablist" aria-label="Board lanes">
        {LANES.map((l) => {
          const count = board?.lanes[l.id].length ?? 0;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={active === l.id}
              className={`cb-tab${active === l.id ? " cb-tab--on" : ""}${l.id === "exceptions" && count ? " cb-tab--alert" : ""}`}
              onClick={() => setLane(l.id)}
            >
              {l.label}
              <span className="cb-tab-count">{board ? count : "–"}</span>
            </button>
          );
        })}
        {extra ? (
          <button
            type="button"
            role="tab"
            aria-selected={active === "extra"}
            className={`cb-tab${active === "extra" ? " cb-tab--on" : ""}`}
            onClick={() => setLane("extra")}
          >
            {extra.label}
            <span className="cb-tab-count">{extra.count}</span>
          </button>
        ) : null}
      </div>
      {active === "extra" ? (
        <div role="tabpanel">{extra?.content}</div>
      ) : board ? (
        board.lanes[active].length ? (
          <ul className="cb-list" role="tabpanel">
            {board.lanes[active].map((item) => (
              <ItemRow key={item.id} item={item} demo={demo} onChange={refresh} />
            ))}
          </ul>
        ) : (
          <p className="cb-empty">{LANES.find((l) => l.id === active)!.empty}</p>
        )
      ) : (
        <p className="cb-muted">Reading the board…</p>
      )}
      {board && !demo ? <TryDemo empty={empty} /> : null}
    </section>
  );
}
