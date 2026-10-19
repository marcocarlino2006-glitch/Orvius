"use client";

import { useState } from "react";
import { CHECKING, runCheckedWrite } from "@/lib/checked-write";
import { sendWrite } from "@/lib/client-write";

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
    const wanted = text.trim().replace(/\s+/g, " ").toLowerCase();
    try {
      type Saved = { synced: boolean | null; next: string | null };
      const result = await runCheckedWrite<Saved>({
        send: () => sendWrite("/api/account/receptionist-rules", "POST", { text, callId }),
        accept: (data) => {
          const d = data as { rule?: { id?: unknown }; synced?: unknown; receptionistApply?: { next?: string | null } | null } | null;
          if (typeof d?.rule?.id !== "string" || typeof d.synced !== "boolean") return null;
          return { synced: d.synced, next: d.receptionistApply?.next ?? null };
        },
        readBack: async () => {
          const res = await fetch("/api/account/receptionist-rules", { cache: "no-store" });
          if (!res.ok) return null;
          const rules = ((await res.json().catch(() => null)) as { rules?: { text?: string }[] } | null)?.rules;
          if (!Array.isArray(rules)) return null;
          return rules.some((r) => (r.text ?? "").replace(/\s+/g, " ").toLowerCase().startsWith(wanted.slice(0, 40))) ? { synced: null, next: null } : "absent";
        },
        onChecking: () => setNote({ tone: "ok", text: CHECKING }),
      });
      if (result.kind !== "confirmed") {
        setNote({ tone: "error", text: result.message });
        return;
      }
      setText("");
      setOpen(false);
      const { synced, next } = result.value;
      setNote({
        tone: synced ? "ok" : "error",
        text: synced
          ? "Saved, and the receptionist confirmed it. It follows it from the next call."
          : synced === null
            ? "Saved. Settings shows whether the receptionist has your latest changes."
            : `Saved, but the receptionist hasn't confirmed it. ${next ?? "Settings shows whether it has your latest changes."}`,
      });
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
