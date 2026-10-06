"use client";

import { useState } from "react";
import { ShellPanel } from "@/components/shell-primitives";

const MAX = 200;

/** One correction from this call, followed on every call after it. */
export function CorrectReceptionist({ callId }: { callId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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

  return (
    <ShellPanel title="Correct the receptionist" dense>
      <form onSubmit={(e) => void save(e)} className="font-sans">
        <p className="text-sm text-ash">
          Something it should do differently next time? Write it the way you&apos;d tell a new hire.
        </p>
        <textarea
          className="input mt-2 w-full"
          rows={2}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="We don't do gas lines. Tell callers to call the gas company first."
          aria-label="Correction for the receptionist"
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" className="btn btn-secondary text-sm" disabled={busy || text.trim().length < 4}>
            {busy ? "Saving…" : "Save correction"}
          </button>
          {note ? (
            <span className={`text-sm ${note.tone === "error" ? "text-flare-dim" : "text-ash"}`} role="status">
              {note.text}
            </span>
          ) : null}
        </div>
      </form>
    </ShellPanel>
  );
}
