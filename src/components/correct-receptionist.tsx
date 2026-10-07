"use client";

import { useState } from "react";

const MAX = 200;

/** One correction from this call, followed on every call after it. Closed until asked for. */
export function CorrectReceptionist({ callId }: { callId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/account/receptionist-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, callId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; synced?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Could not save the correction. Try again.");
      setText("");
      setOpen(false);
      setNote({
        tone: "ok",
        text: data.synced
          ? "Saved. The receptionist follows it from the next call."
          : "Saved. It reaches the receptionist the next time your line syncs.",
      });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : "Could not save the correction." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="cr-closed font-sans">
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setOpen(true)}>
          Teach Orvius
        </button>
        {note ? (
          <span className={`text-sm ${note.tone === "error" ? "text-flare-dim" : "text-ash"}`} role="status">
            {note.text}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="cr-form font-sans">
      <textarea
        className="input w-full"
        rows={3}
        maxLength={MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tell it like you'd tell a new hire: we don't do gas lines, tell callers to call the gas company first."
        aria-label="Something Orvius should do differently next time"
        autoFocus
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy || text.trim().length < 4}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => { setOpen(false); setText(""); }}>
          Cancel
        </button>
        {note?.tone === "error" ? (
          <span className="text-sm text-flare-dim" role="status">
            {note.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
