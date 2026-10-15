"use client";

import { toast } from "@/components/toaster";
import { jobStatusLabel, nextJobStatus } from "@/lib/job-status";
import { useInstantAction } from "@/components/instant-action";
import { askCompletion } from "@/components/completion-prompt";

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
  const { pending: loading, error, run } = useInstantAction();
  const next = nextJobStatus(status);

  if (!next) return null;

  async function setJobStatus(value: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value, ...extra }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? "That didn't go through — the job hasn't moved");
  }

  async function advance(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading || !next) return;

    const previous = status;
    const target = next.status;
    if (target === "completed") {
      const asked = askCompletion({ fromOnSite: status === "on_site" });
      if (!asked) return;
      if ("error" in asked) {
        toast({ title: asked.error, tone: "error" });
        return;
      }
      onAdvanced?.(target);
      try {
        await run(() => setJobStatus(target, { completion: asked.completion, ...(asked.reason ? { reason: asked.reason } : {}) }), {
          pendingTitle: "Marking it done…",
          doneTitle: "Marked done",
          revert: () => onAdvanced?.(previous),
        });
      } catch {
        /* The hook already toasted the failure and rolled the row back. */
      }
      return;
    }
    /* The job moves the moment the tap lands; the server confirms after. */
    onAdvanced?.(target);
    try {
      await run(() => setJobStatus(target), {
        pendingTitle: `Moving to ${jobStatusLabel(target)}…`,
        doneTitle: `Moved to ${jobStatusLabel(target)}`,
        action: {
          label: "Undo",
          run: async () => {
            onAdvanced?.(previous);
            try {
              await setJobStatus(previous);
            } catch {
              onAdvanced?.(target);
              toast({ title: "Couldn't undo — the job is still moved.", tone: "error" });
            }
          },
        },
        revert: () => onAdvanced?.(previous),
      });
    } catch {
      /* The hook already toasted the failure and rolled the row back. */
    }
  }

  return (
    <div
      className={`job-status-advance ${compact ? "job-status-advance-compact" : ""} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`job-status-advance-btn font-sans${compact ? " job-status-advance-btn-compact" : ""}${loading ? " is-instant-pending" : ""}`}
        disabled={loading}
        onClick={advance}
      >
        {loading ? "Moving…" : next.label}
      </button>
      {error ? <span className="job-status-advance-error font-sans">{error}</span> : null}
    </div>
  );
}
