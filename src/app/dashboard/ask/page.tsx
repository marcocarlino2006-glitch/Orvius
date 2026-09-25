"use client";

import { CopilotActions, type CopilotRecommendation } from "@/components/copilot-actions";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { RecordLink } from "@/components/record-drawer";
import { ASK_SUGGESTIONS } from "@/lib/ask-suggestions";
import { isRecordType } from "@/lib/record-types";
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
  error?: string;
};

const HIT_LABEL: Record<string, string> = {
  call: "Call",
  lead: "Lead",
  customer: "Customer",
  job: "Job",
  technician: "Technician",
};

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((t) => t.status === "pending");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function run(id: number, q: string) {
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => null)) as {
        answer?: string;
        source?: string;
        hits?: Hit[];
        brief?: Brief;
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
                <p className="ask-intro-kicker">Shop intelligence</p>
                <h2 className="ask-intro-title">Ask what happened, what matters, and what to do next.</h2>
                <p className="ask-intro-copy">
                  Every answer cites the records it used. When Orvius proposes an action, it tells you exactly
                  what will happen and waits for your approval.
                </p>
                <ul className="ask-suggest-grid">
                  {ASK_SUGGESTIONS.map((item) => (
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

                {turn.status === "pending" ? (
                  <div className="ask-answer2 is-pending" aria-busy="true">
                    <p className="ask-thinking">Reading shop records…</p>
                    <span className="skeleton ask-skel" />
                    <span className="skeleton ask-skel ask-skel--short" />
                  </div>
                ) : null}

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
                    <p className="ask-text">{turn.answer}</p>

                    {turn.brief?.matters.length ? (
                      <div className="ask-brief">
                        <p className="ask-brief-label">What matters</p>
                        <ul>
                          {turn.brief.matters.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {turn.brief?.uncertainty.length ? (
                      <div className="ask-brief ask-brief--unsure">
                        <p className="ask-brief-label">What Orvius is not sure about</p>
                        <ul>
                          {turn.brief.uncertainty.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {turn.hits?.length ? (
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
                    ) : (
                      <p className="ask-no-evidence">No specific records matched — this answer is from shop totals.</p>
                    )}

                    <CopilotActions hits={turn.hits ?? []} recommendation={turn.brief?.recommendation} />
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
