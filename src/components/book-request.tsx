"use client";

import { useState } from "react";
import { toast } from "@/components/toaster";

type Window = { at: string; label: string };

/**
 * Booking a request makes the job. The times offered are the shop's real open
 * windows; with no time given the server books the first open one.
 */
export function BookRequest({
  leadId,
  onBooked,
  className = "",
}: {
  leadId: string;
  onBooked: (jobId: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [custom, setCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setError(null);
    if (windows) return;
    try {
      const res = await fetch(`/api/command/slots?leadId=${encodeURIComponent(leadId)}`);
      const data = (await res.json().catch(() => ({}))) as { windows?: Window[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the schedule.");
      setWindows(data.windows ?? []);
    } catch (err) {
      setWindows([]);
      setError(err instanceof Error ? err.message : "Couldn't read the schedule.");
    }
  }

  async function book(key: string, at: string | null, local: string | null = null) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, scheduledAt: at, scheduledLocal: local, notes: notes.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { job?: { id: string }; error?: string; code?: string };
      if (!res.ok || !data.job) {
        throw new Error(
          data.code === "lead_needs_details"
            ? "Add the caller's phone and what the job is first."
            : (data.error ?? "Couldn't book it."),
        );
      }
      toast({ title: "Booked — the customer gets a confirmation text" });
      setOpen(false);
      onBooked(data.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't book it.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`book-request ${className}`.trim()}>
      <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" aria-expanded={open} onClick={() => void toggle()}>
        Book a job
      </button>
      {open ? (
        <div className="book-request-panel" role="group" aria-label="Pick a time">
          <p className="book-request-note">{windows === null ? "Reading the schedule…" : windows.length ? "Open on your schedule" : "Nothing open in the next two weeks."}</p>
          {windows?.length ? (
            <div className="book-request-times">
              {windows.map((w) => (
                <button key={w.at} type="button" className="book-request-time" disabled={busy !== null} onClick={() => void book(w.at, w.at)}>
                  {busy === w.at ? "Booking…" : w.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="book-request-custom">
            <label>
              <span>Another time (shop clock)</span>
              <input type="datetime-local" className="input" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </label>
            <button
              type="button"
              className="ox-btn ox-btn--quiet ox-btn--sm"
              disabled={busy !== null || !custom}
              onClick={() => void book("custom", null, custom)}
            >
              {busy === "custom" ? "Booking…" : "Book this time"}
            </button>
          </div>
          <label className="book-request-notes">
            <span>Notes for the technician</span>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parts to bring…" />
          </label>
          {windows !== null && !windows.length ? (
            <button type="button" className="book-request-later" disabled={busy !== null} onClick={() => void book("first", null)}>
              {busy === "first" ? "Booking…" : "Book the first open time"}
            </button>
          ) : null}
          {error ? (
            <p className="cb-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
