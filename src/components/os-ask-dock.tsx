"use client";

import { CopilotActions } from "@/components/copilot-actions";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type AskHit = {
  type: string;
  id: string;
  href: string;
  title: string;
  summary: string;
};

type AskTurn = {
  question: string;
  answer: string;
  source: string;
  hits: AskHit[];
};

const QUICK_ASK = [
  "Who called today?",
  "Any new leads?",
  "Who is scheduled today?",
];

function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 1.5l1.1 3.4h3.6l-2.9 2.1 1.1 3.4L9 8.3l-2.9 2.1 1.1-3.4-2.9-2.1h3.6L9 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M4 14.5h10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M8 3l-4 4M8 3l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OsAskDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turn, setTurn] = useState<AskTurn | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hidden = pathname === "/dashboard/ask" || pathname.startsWith("/dashboard/ask/");

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim();
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
      setTurn({
        question: q,
        answer: data.answer,
        source: data.source,
        hits: data.hits ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (hidden) return null;

  return (
    <div className={`os-ask-dock font-sans ${open ? "os-ask-dock-open" : ""}`}>
      {open ? (
        <div className="os-ask-dock-panel" role="dialog" aria-label="Ops copilot">
          <div className="os-ask-dock-head">
            <div>
              <p className="os-ask-dock-kicker">Ops copilot</p>
              <p className="os-ask-dock-title">Your shop memory</p>
            </div>
            <div className="os-ask-dock-head-actions">
              <Link href="/dashboard/ask" className="os-ask-dock-link">
                Full view
              </Link>
              <button
                type="button"
                className="os-ask-dock-close"
                aria-label="Close Ask"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {turn ? (
            <div className="os-ask-dock-answer">
              <p className="os-ask-dock-q">{turn.question}</p>
              <p className="os-ask-dock-a">{turn.answer}</p>
              {turn.hits.length ? (
                <ul className="os-ask-dock-hits">
                  {turn.hits.slice(0, 3).map((hit) => (
                    <li key={`${hit.type}-${hit.id}`}>
                      <Link href={hit.href} className="os-ask-dock-hit">
                        {hit.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <CopilotActions hits={turn.hits} compact />
            </div>
          ) : (
            <p className="os-ask-dock-hint">
              Ask about the board, then approve an action before it runs.
            </p>
          )}

          {error ? <p className="os-ask-dock-error">{error}</p> : null}

          <div className="os-ask-dock-chips">
            {QUICK_ASK.map((item) => (
              <button
                key={item}
                type="button"
                className="os-ask-dock-chip"
                disabled={loading}
                onClick={() => void ask(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <form
            className="os-ask-dock-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              ref={inputRef}
              className="os-ask-dock-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Orvius…"
              autoComplete="off"
              disabled={loading}
            />
            <button
              type="submit"
              className="os-ask-dock-send"
              disabled={loading || !question.trim()}
              aria-label="Send question"
            >
              {loading ? "…" : <SendIcon />}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="os-ask-dock-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="os-ask-dock-trigger-mark" aria-hidden>
          <AskIcon />
        </span>
        <span className="os-ask-dock-trigger-label">Copilot</span>
      </button>
    </div>
  );
}
