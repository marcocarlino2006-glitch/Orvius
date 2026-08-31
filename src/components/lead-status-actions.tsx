"use client";

import { ShellBadge } from "@/components/shell-primitives";
import { useState } from "react";

export const LEAD_STATUSES = [
  { value: "new", label: "New", tone: "live" as const },
  { value: "contacted", label: "Contacted", tone: "neutral" as const },
  { value: "booked", label: "Booked", tone: "live" as const },
  { value: "lost", label: "Lost", tone: "neutral" as const },
  { value: "spam", label: "Spam", tone: "flare" as const },
];

type LeadStatusActionsProps = {
  leadId: string;
  status: string;
  onUpdated?: (status: string) => void;
  compact?: boolean;
};

export function LeadStatusBadge({ status }: { status: string }) {
  const match = LEAD_STATUSES.find((item) => item.value === status);
  return (
    <ShellBadge tone={match?.tone ?? "neutral"}>
      {match?.label ?? status}
    </ShellBadge>
  );
}

export function LeadStatusActions({
  leadId,
  status,
  onUpdated,
  compact = false,
}: LeadStatusActionsProps) {
  const [current, setCurrent] = useState(status);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(next: string) {
    if (next === current) return;
    setLoading(next);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setCurrent(next);
      onUpdated?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(null);
    }
  }

  const actions =
    current === "booked"
      ? LEAD_STATUSES.filter((item) =>
          ["contacted", "lost", "spam"].includes(item.value),
        )
      : LEAD_STATUSES.filter((item) => item.value !== current);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <LeadStatusBadge status={current} />
        {!compact ? (
          <span className="font-sans text-xs text-ash">Update status</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={loading !== null}
            className={`btn text-sm ${
              item.value === "spam" ? "btn-secondary" : "btn-void"
            } ${compact ? "px-3 py-2" : ""}`}
            onClick={() => updateStatus(item.value)}
          >
            {loading === item.value ? "Saving…" : item.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="font-sans text-xs text-flare-dim">{error}</p>
      ) : null}
    </div>
  );
}
