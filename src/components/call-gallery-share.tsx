"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShellPanel } from "@/components/shell-primitives";

type Turn = { who: "ai" | "caller"; text: string };
type Status = "pending" | "listed" | "removed" | "withdrawn" | null;
type Draft =
  | { shareable: false; reason: string; status?: Status }
  | { shareable: true; status: Status; draft: { shopName: string; turns: Turn[] } };

const STATUS_COPY: Record<Exclude<Status, null>, string> = {
  pending: "Sent. Someone at Orvius reads it before it goes on the gallery.",
  listed: "On the public gallery now.",
  removed: "Orvius kept this call off the gallery.",
  withdrawn: "You took this call off the gallery.",
};

/** Owner-only: put this call's masked transcript on the public gallery of real calls. */
export function CallGalleryShare({ callId }: { callId: string }) {
  const [view, setView] = useState<Draft | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/calls/${callId}/gallery`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Draft | null) => live && setView(data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [callId]);

  if (!view) return null;
  const status = view.status ?? null;

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${callId}/gallery`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ callerAgreed: agreed }) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { status?: Status; error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't go through. Try again.");
      setView((v) => (v ? ({ ...v, status: data.status ?? null } as Draft) : v));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShellPanel title="Share on the Orvius gallery" dense action={<Link href="/calls" className="cl-source font-sans">See the gallery</Link>}>
      {status ? <p className="font-sans text-sm leading-relaxed text-void">{STATUS_COPY[status]}</p> : null}
      {status === "pending" || status === "listed" ? (
        <button type="button" className="ov-btn ov-btn--quiet mt-3" disabled={busy} onClick={() => send("DELETE")}>
          Take it down
        </button>
      ) : !view.shareable ? (
        <p className="jv-sub font-sans">{view.reason}</p>
      ) : status === "removed" ? null : !open ? (
        <>
          <p className="jv-sub font-sans">
            Show other shop owners a real call. Only the words go up, with the caller&apos;s name, number and address hidden. No audio.
          </p>
          <button type="button" className="ov-btn ov-btn--quiet mt-3" onClick={() => setOpen(true)}>
            Read what would be shared
          </button>
        </>
      ) : (
        <div className="cgs">
          <ol className="cgs-turns font-sans">
            {view.draft.turns.map((t, i) => (
              <li key={i}>
                <strong>{t.who === "ai" ? view.draft.shopName : "Caller"}:</strong> {t.text}
              </li>
            ))}
          </ol>
          <label className="cgs-agree font-sans">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> The caller agreed to have this call shared publicly.
          </label>
          <div className="cgs-actions">
            <button type="button" className="ov-btn ov-btn--solid" disabled={!agreed || busy} onClick={() => send("POST")}>
              Send for review
            </button>
            <button type="button" className="ov-btn ov-btn--quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p className="jv-sub font-sans" role="alert">
          {error}
        </p>
      ) : null}
    </ShellPanel>
  );
}
