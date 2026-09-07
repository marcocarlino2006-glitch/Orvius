"use client";

import { CopilotActions } from "@/components/copilot-actions";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "How many jobs did we book this week?",
  "Which calls from yesterday were not booked?",
  "What's unassigned on dispatch?",
  "Any emergencies in the inbox?",
];

type Hit = {
  type: string;
  id: string;
  href: string;
  title: string;
  summary: string;
};

type Turn = {
  question: string;
  answer: string;
  source: string;
  hits: Hit[];
};

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(nextQuestion: string) {
    const q = nextQuestion.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setQuestion("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ask failed");
      setTurns((current) => [
        {
          question: q,
          answer: data.answer,
          source: data.source,
          hits: data.hits ?? [],
        },
        ...current,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OsShell
      title="Ops copilot"
      subtitle="Ask about the shop — then approve actions. Grounded in your calls, jobs, and dispatch."
    >
      <PlanUpgradeGate module="ask">
      <div className="ask-hero pro-panel pro-panel--dense">
        <div className="pro-panel-head">
          <h2 className="pro-panel-title font-sans">Shop memory</h2>
        </div>
        <div className="pro-panel-body ask-hero-inner">
          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              className="input ask-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Who called today? What's on the board?"
              autoComplete="off"
            />
            <button type="submit" disabled={loading} className="btn btn-void ask-submit">
              {loading ? "Searching…" : "Ask"}
            </button>
          </form>

          <div className="ask-suggestions" role="list">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                role="listitem"
                className="ask-rail-row font-sans"
                onClick={() => void ask(item)}
                disabled={loading}
              >
                <span className="ask-rail-kind">Ask</span>
                <span className="ask-rail-q">{item}</span>
                <span className="ask-rail-go">Run</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      {!turns.length && !loading ? (
        <div className="ask-empty-state">
          <p className="ask-empty-title font-sans">
            Your shop data, not generic AI.
          </p>
          <p className="ask-empty font-sans">
            Ask pulls from calls, leads, customers, and jobs already in Orvius.
            When answers include jobs or leads, propose an action and approve before it runs.
          </p>
        </div>
      ) : null}

      <ol className="ask-turns">
        {turns.map((turn, index) => (
          <li key={`${turn.question}-${index}`} className="ask-turn pro-panel pro-panel--dense">
            <div className="pro-panel-head">
              <p className="pro-panel-title font-sans">You asked</p>
            </div>
            <div className="pro-panel-body">
              <p className="ask-q font-sans">{turn.question}</p>
              <div className="ask-a">
                <p className="ask-source font-sans">
                  {turn.source === "memory+model" ? "Shop record + model" : "From shop record"}
                </p>
                <p className="ask-answer font-sans whitespace-pre-wrap">{turn.answer}</p>
                {turn.hits.length ? (
                  <ul className="ask-hits">
                    {turn.hits.map((hit) => (
                      <li key={`${hit.type}-${hit.id}`}>
                        <Link href={hit.href} className="ask-hit font-sans">
                          <span className="ask-hit-type">{hit.type}</span>
                          <span className="ask-hit-title">{hit.title}</span>
                          <span className="ask-hit-sum">{hit.summary}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <CopilotActions hits={turn.hits} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      </PlanUpgradeGate>
    </OsShell>
  );
}
