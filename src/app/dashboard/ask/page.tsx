"use client";

import { CopilotActions, type CopilotRecommendation } from "@/components/copilot-actions";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { RecordLink } from "@/components/record-drawer";
import { ASK_SUGGESTIONS } from "@/lib/ask-suggestions";
import { commandNow } from "@/lib/command-now";
import { isRecordType } from "@/lib/record-types";
import { useRing1 } from "@/lib/ring1-context";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Hit = {
  type: string;
  id: string;
  href: string;
  title: string;
  summary: string;
};

type Brief = {
  matters: string[];
  uncertainty: string[];
  recommendation: CopilotRecommendation | null;
};

type Turn = {
  id: number;
  question: string;
  status: "pending" | "done" | "failed";
  answer?: string;
  source?: string;
  hits?: Hit[];
  brief?: Brief;
  followUp?: string | null;
  error?: string;
  revealed?: boolean;
};

type Opening = { headline: string; detail: string; suggestions: string[] };

const THINKING_STEPS = [
  "Reading shop records…",
  "Checking calls, jobs and money…",
  "Putting your answer together…",
];

function ThinkingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1)), 1100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="ask-answer2 is-pending" aria-busy="true">
      <p className="ask-thinking">
        <span className="ask-live-dot" aria-hidden />
        {THINKING_STEPS[step]}
      </p>
      <span className="skeleton ask-skel" />
      <span className="skeleton ask-skel ask-skel--short" />
    </div>
  );
}

/** The answer arrives the way a person would say it — progressively, not in one dead block. */
function RevealText({ text, onDone }: { text: string; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || text.length < 40) {
      setShown(text.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const step = Math.max(2, Math.ceil(text.length / 80));
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
    }, 14);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const typing = shown < text.length;
  return (
    <p
      className="ask-text"
      onClick={() => {
        if (typing) {
          setShown(text.length);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone();
          }
        }
      }}
    >
      {text.slice(0, shown)}
      {typing ? <span className="ask-caret" aria-hidden /> : null}
    </p>
  );
}

const HIT_LABEL: Record<string, string> = {
  call: "Call",
  lead: "Lead",
  customer: "Customer",
  job: "Job",
  technician: "Technician",
};

const HOME_QUESTION = "What should I do now?";

export default function AskPage() {
  const { data } = useRing1();
  const sentence = commandNow(data);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [opening, setOpening] = useState<Opening | null>(null);
  const nextId = useRef(1);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((t) => t.status === "pending");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => {
    let live = true;
    fetch("/api/ask")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { opening?: Opening | null } | null) => {
        if (live && data?.opening) setOpening(data.opening);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function run(id: number, q: string) {
    const history = turnsRef.current
      .filter((t) => t.status === "done" && t.answer)
      .slice(-6)
      .map((t) => ({ question: t.question, answer: t.answer as string }));
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = (await res.json().catch(() => null)) as {
        answer?: string;
        source?: string;
        hits?: Hit[];
        brief?: Brief;
        followUp?: string | null;
        error?: string;
      } | null;
      if (!res.ok || !data?.answer) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again to ask about the shop."
            : res.status === 429
              ? "Too many questions at once. Wait a moment and retry."
              : "Orvius could not read the shop records just now.",
        );
      }
      setTurns((current) =>
        current.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "done",
                answer: data.answer,
                source: data.source,
                hits: data.hits ?? [],
                brief: data.brief,
                followUp: data.followUp ?? null,
                revealed: false,
              }
            : t,
        ),
      );
    } catch (err) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setTurns((current) =>
        current.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "failed",
                error: offline
                  ? "You are offline. Your question is kept — retry when the connection returns."
                  : err instanceof Error
                    ? err.message
                    : "Orvius could not answer.",
              }
            : t,
        ),
      );
    }
  }

  function ask(nextQuestion: string) {
    const q = nextQuestion.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    setQuestion("");
    setTurns((current) => [...current, { id, question: q, status: "pending" }]);
    void run(id, q);
    inputRef.current?.focus();
  }

  function retry(turn: Turn) {
    setTurns((current) => current.map((t) => (t.id === turn.id ? { ...t, status: "pending", error: undefined } : t)));
    void run(turn.id, turn.question);
  }

  return (
    <OsShell title="Ask">
      <PlanUpgradeGate module="ask">
        <div className="ask-ws">
          <div className="ask-thread" aria-live="polite">
            {!turns.length ? (
              <div className="ask-intro">
                <h2 className="ask-intro-title">{data ? sentence : (opening?.headline ?? "Reading the shop…")}</h2>
                <p className="ask-intro-copy">
                  {data
                    ? "This is the line on Home. Ask a follow-up and the answer cites the shop's records."
                    : (opening?.detail ??
                      "Every answer cites the records it used. When Orvius proposes an action, it tells you exactly what will happen and waits for your approval.")}
                </p>
                <ul className="ask-suggest-grid">
                  {(opening?.suggestions.length ? opening.suggestions : [...ASK_SUGGESTIONS].slice(0, 4))
                    .filter((item) => item !== HOME_QUESTION)
                    .map((item) => (
                    <li key={item}>
                      <button type="button" className="ask-suggest" onClick={() => ask(item)}>
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {turns.map((turn) => (
              <article key={turn.id} className="ask-turn2">
                <p className="ask-you">{turn.question}</p>

                {turn.status === "pending" ? <ThinkingSteps /> : null}

                {turn.status === "failed" ? (
                  <div className="ox-state ox-state--failure ox-state--inline">
                    <p className="ox-state-title">No answer yet</p>
                    <p className="ox-state-copy">{turn.error}</p>
                    <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => retry(turn)}>
                      Retry
                    </button>
                  </div>
                ) : null}

                {turn.status === "done" ? (
                  <div className="ask-answer2">
                    <p className="ask-source2">
                      {turn.source === "memory+model" ? "Shop records + reasoning" : "From shop records"}
                    </p>
                    <RevealText
                      text={turn.answer ?? ""}
                      onDone={() =>
                        setTurns((current) => current.map((t) => (t.id === turn.id ? { ...t, revealed: true } : t)))
                      }
                    />

                    {turn.revealed && turn.brief?.matters.length ? (
                      <div className="ask-brief">
                        <p className="ask-brief-label">What matters</p>
                        <ul>
                          {turn.brief.matters.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {turn.revealed && turn.brief?.uncertainty.length ? (
                      <div className="ask-brief ask-brief--unsure">
                        <p className="ask-brief-label">What Orvius is not sure about</p>
                        <ul>
                          {turn.brief.uncertainty.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {turn.revealed && turn.hits?.length ? (
                      <div className="ask-evidence">
                        <p className="ask-evidence-label">Evidence · {turn.hits.length}</p>
                        <ul>
                          {turn.hits.map((hit) => {
                            const body = (
                              <>
                                <span className="ask-ev-type">{HIT_LABEL[hit.type] ?? hit.type}</span>
                                <span className="ask-ev-title">{hit.title}</span>
                                <span className="ask-ev-sum">{hit.summary}</span>
                              </>
                            );
                            return (
                              <li key={`${hit.type}-${hit.id}`}>
                                {isRecordType(hit.type) ? (
                                  <RecordLink type={hit.type} id={hit.id} href={hit.href} className="ask-ev">
                                    {body}
                                  </RecordLink>
                                ) : (
                                  <Link href={hit.href} className="ask-ev">
                                    {body}
                                  </Link>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : turn.revealed ? (
                      <p className="ask-no-evidence">No specific records matched — this answer is from shop totals.</p>
                    ) : null}

                    {turn.revealed ? (
                      <CopilotActions hits={turn.hits ?? []} recommendation={turn.brief?.recommendation} />
                    ) : null}

                    {turn.revealed && turn.followUp ? (
                      <div className="ask-followup-row">
                        <span className="ask-followup-label">Next</span>
                        <button type="button" className="ask-chip" disabled={busy} onClick={() => ask(turn.followUp as string)}>
                          {turn.followUp}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <form
            className="ask-composer"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <label htmlFor="ask-input" className="sr-only">
              Ask about your shop
            </label>
            <textarea
              id="ask-input"
              ref={inputRef}
              className="ask-composer-input"
              value={question}
              rows={1}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              placeholder="Ask about calls, customers, jobs, or what to do next"
              autoComplete="off"
            />
            <button
              type="submit"
              className="ox-btn ox-btn--primary ask-composer-send"
              disabled={busy || !question.trim()}
            >
              {busy ? "Thinking…" : "Ask"}
            </button>
          </form>
          {turns.length ? (
            <div className="ask-followups" aria-label="Suggested questions">
              {ASK_SUGGESTIONS.filter((s) => !turns.some((t) => t.question === s))
                .slice(0, 3)
                .map((item) => (
                  <button key={item} type="button" className="ask-chip" disabled={busy} onClick={() => ask(item)}>
                    {item}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      </PlanUpgradeGate>
    </OsShell>
  );
}
