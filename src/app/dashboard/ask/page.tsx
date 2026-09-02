"use client";

import { ProRingBanner } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "How many jobs did we book this week?",
  "Who is scheduled today?",
  "Any emergencies in the inbox?",
  "What's unassigned on dispatch?",
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
      title="Ask"
      subtitle="Plain-language answers from your calls, customers, and jobs — not the internet."
    >
      <PlanUpgradeGate module="ask">
      <ProRingBanner
        name="Shop memory"
        description="Search your record by name, phone, schedule, or urgency. Every answer links back to the source."
      />

      <div className="ask-hero pro-panel">
        <div className="ask-hero-inner">
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

          <div className="ask-suggestions">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className="ask-chip font-sans"
                onClick={() => void ask(item)}
                disabled={loading}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
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
            Start with a suggestion above.
          </p>
        </div>
      ) : null}

      <ol className="ask-turns">
        {turns.map((turn, index) => (
          <li key={`${turn.question}-${index}`} className="ask-turn pro-panel">
            <div className="ask-turn-head">
              <p className="pro-section-kicker font-sans">You asked</p>
              <p className="ask-q font-sans">{turn.question}</p>
            </div>
            <div className="ask-a">
              <p className="ask-source font-sans">
                <span className="home-os-live-dot" aria-hidden />
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
            </div>
          </li>
        ))}
      </ol>
      </PlanUpgradeGate>
    </OsShell>
  );
}
