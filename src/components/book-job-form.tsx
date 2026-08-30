"use client";

import { suggestedSchedule } from "@/lib/job-schedule";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BookJobForm({
  leadId,
  urgency,
}: {
  leadId: string;
  urgency?: string | null;
}) {
  const router = useRouter();
  const defaultValue = useMemo(
    () => toDatetimeLocal(suggestedSchedule(urgency)),
    [urgency],
  );
  const [scheduledAt, setScheduledAt] = useState(defaultValue);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book job");
      router.push(`/dashboard/jobs/${data.job.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book job");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="label">Scheduled for</span>
        <input
          type="datetime-local"
          required
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="input mt-1.5"
        />
      </label>
      <label className="block">
        <span className="label">Notes for the job</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input mt-1.5"
          placeholder="Gate code, preferred tech, parts to bring…"
        />
      </label>
      {error ? (
        <p className="font-sans text-sm text-flare-dim">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className={`btn btn-void ${loading ? "btn-loading" : ""}`}
      >
        {loading ? "Booking…" : "Book job"}
      </button>
    </form>
  );
}
