"use client";

import { useState } from "react";
import { toast } from "@/components/toaster";

/** Sends the owner a real alert, so a failed one can be proven fixed instead of assumed. */
export function TestAlertButton({ onDone, primary = false }: { onDone?: () => void; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send a test alert");
      if (!data?.ok) throw new Error(data?.error ?? "The alert was queued but not delivered. Check Settings → Notifications.");
      toast({ title: "Test alert sent. Check your phone." });
      onDone?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`ox-btn ${primary ? "ox-btn--primary" : "ox-btn--quiet"} ox-btn--sm`} disabled={busy} onClick={() => void run()}>
        {busy ? "Sending…" : "Send a test alert"}
      </button>
      {err ? (
        <span className="cb-error" role="alert">
          {err}
        </span>
      ) : null}
    </>
  );
}
