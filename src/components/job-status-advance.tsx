"use client";

import { nextJobStatus } from "@/lib/job-status";
import { useState } from "react";

type JobStatusAdvanceProps = {
  jobId: string;
  status: string;
  onAdvanced?: (nextStatus: string) => void;
  className?: string;
  compact?: boolean;
};

export function JobStatusAdvance({
  jobId,
  status,
  onAdvanced,
  className = "",
  compact = false,
}: JobStatusAdvanceProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextJobStatus(status);

  if (!next) return null;

  async function advance(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading || !next) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next.status }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      onAdvanced?.(next.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`job-status-advance ${compact ? "job-status-advance-compact" : ""} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`job-status-advance-btn font-sans ${compact ? "job-status-advance-btn-compact" : ""}`}
        disabled={loading}
        onClick={advance}
      >
        {loading ? "…" : next.label}
      </button>
      {error ? <span className="job-status-advance-error font-sans">{error}</span> : null}
    </div>
  );
}
