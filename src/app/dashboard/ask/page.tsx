"use client";

import { OsShell } from "@/components/os-shell";
import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "Who is on the board today?",
  "Who called about AC?",
  "Any emergencies?",
  "Tell me about Maria",
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
      subtitle="Answers from the records already in the OS — not the public internet."
    >
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
          placeholder="Ask about a customer, a job, or who called…"
          autoComplete="off"
        />
        <button type="submit" disabled={loading} className="btn btn-void">
          {loading ? "Remembering…" : "Ask"}
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

      {error ? (
        <p className="mt-4 font-sans text-sm text-flare-dim">{error}</p>
      ) : null}

      {!turns.length && !loading ? (
        <p className="ask-empty font-sans">
          ChatGPT forgets because it never ran the shop. Orvius answers from the
          record — every call, customer, and booked job.
        </p>
      ) : null}

      <ol className="ask-turns">
        {turns.map((turn, index) => (
          <li key={`${turn.question}-${index}`} className="ask-turn">
            <p className="ask-q font-serif">{turn.question}</p>
            <div className="ask-a">
              <p className="home-os-ask-source">
                {turn.source === "memory+model" ? "Memory + model" : "From OS memory"}
              </p>
              <p className="mt-3 font-sans text-[0.9375rem] leading-relaxed text-void whitespace-pre-wrap">
                {turn.answer}
              </p>
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
    </OsShell>
  );
}
