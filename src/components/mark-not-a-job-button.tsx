"use client";

import { useState } from "react";
import { toast } from "@/components/toaster";
import { sendWrite } from "@/lib/client-write";

/**
 * Spam, a sales call, the wrong trade or out of area: one tap takes the
 * request off the board. It is marked spam on the request, which keeps it out
 * of booked and lost demand, and the change is in the request's history.
 */
export function MarkNotAJobButton({ leadId, onDone, primary = false }: { leadId: string; onDone: () => void; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await sendWrite(`/api/leads/${leadId}`, "PATCH", { status: "spam" });
      toast({ title: "Cleared as not a job" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`ox-btn ${primary ? "ox-btn--primary" : "ox-btn--quiet"} ox-btn--sm`} disabled={busy} onClick={() => void clear()}>
        Not a job
      </button>
      {error ? (
        <p className="cb-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
