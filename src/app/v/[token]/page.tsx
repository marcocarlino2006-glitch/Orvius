"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "@/app/public-field.css";

type View = { businessName: string; title: string; already: boolean };

export default function VisitReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/public/review/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as View & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "This link isn't valid.");
          return;
        }
        setView(data);
        if (data.already) setDone(true);
      })
      .catch(() => setError("We couldn't reach Orvius. Check your connection and try again."));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/public/review/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, body, website }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That didn't save.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="pf pf--center">
      {!view && !error ? <p className="pf-muted">Loading the visit…</p> : null}
      {error && !view ? (
        <header className="pf-head">
          <h1 className="pf-title">Link not valid</h1>
          <p className="pf-sub">{error}</p>
        </header>
      ) : null}
      {view && done ? (
        <header className="pf-head">
          <p className="pf-kicker">{view.businessName}</p>
          <h1 className="pf-title">Thanks. The next customer can read it.</h1>
          <p className="pf-sub">{view.title}</p>
        </header>
      ) : null}
      {view && !done ? (
        <form onSubmit={submit}>
          <header className="pf-head">
            <p className="pf-kicker">{view.businessName}</p>
            <h1 className="pf-title">How did the visit go?</h1>
            <p className="pf-sub">{view.title}. Every rating is shown. A low one is kept.</p>
          </header>
          <label aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
            Website
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
          <div className="pf-actions" role="group" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className="pf-action" aria-pressed={rating === n} onClick={() => setRating(n)}>
                <span className="pf-action-label">{n}</span>
              </button>
            ))}
          </div>
          <label className="pf-card">
            <span className="pf-action-detail">What should the next customer know?</span>
            <textarea value={body} maxLength={400} rows={4} onChange={(e) => setBody(e.target.value)} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" className="pf-action" disabled={busy || rating < 1}>
            <span className="pf-action-label">{busy ? "Saving…" : "Publish the review"}</span>
          </button>
        </form>
      ) : null}
    </main>
  );
}
