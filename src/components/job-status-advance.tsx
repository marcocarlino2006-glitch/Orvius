"use client";

import { toast } from "@/components/toaster";
import { jobStatusLabel, nextJobStatus } from "@/lib/job-status";
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

  async function setJobStatus(value: string) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? "Update failed");
  }

  async function advance(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading || !next) return;

    setLoading(true);
    setError(null);
    try {
      await setJobStatus(next.status);
      onAdvanced?.(next.status);
      const previous = status;
      toast({
        title: `Job moved to ${jobStatusLabel(next.status)}`,
        action: {
          label: "Undo",
          run: async () => {
            try {
              await setJobStatus(previous);
              onAdvanced?.(previous);
            } catch {
              toast({ title: "Could not undo. The job is still moved.", tone: "error" });
            }
          },
        },
      });
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
