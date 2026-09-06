"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";

type CallRecordCardProps = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  durationSec: number | null;
  booked: boolean;
  createdAt: string;
  businessName?: string | null;
  leadName?: string | null;
  serviceType?: string | null;
  urgency?: string | null;
  returning?: boolean;
};

function statusTone(status: string): "live" | "flare" | "neutral" | "muted" {
  const s = status.toLowerCase();
  if (s === "completed" || s === "ended") return "live";
  if (s === "failed" || s === "busy" || s === "no-answer") return "flare";
  if (s === "in-progress" || s === "ringing") return "neutral";
  return "muted";
}

function formatStatus(status: string) {
  return status.replace(/-/g, " ");
}

/** Cursor-grade call row. */
export function CallRecordCard({
  id,
  callerPhone,
  status,
  summary,
  durationSec,
  booked,
  createdAt,
  businessName,
  leadName,
  serviceType,
  urgency,
  returning,
}: CallRecordCardProps) {
  const emergency = urgency?.toLowerCase() === "emergency";
  const when = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/dashboard/calls/${id}`}
      className={`lead-rail-row${emergency ? " lead-rail-row-emergency" : ""}`}
    >
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          <p className={`lead-rail-kind ${emergency ? "is-flare" : ""}`}>
            Call · {formatStatus(status)}
            {booked ? " · booked" : ""}
            {returning ? " · returning" : ""}
          </p>
          <time dateTime={createdAt} className="lead-rail-time">
            {when}
            {durationSec ? ` · ${durationSec}s` : ""}
          </time>
        </div>
        <div className="lead-rail-title-row">
          <span className="lead-rail-name">
            {leadName ?? callerPhone ?? "Unknown caller"}
          </span>
          <div className="lead-rail-badges">
            <ShellBadge tone={statusTone(status)}>{formatStatus(status)}</ShellBadge>
            {emergency ? <ShellBadge tone="flare">Emergency</ShellBadge> : null}
          </div>
        </div>
        <p className="lead-rail-sub">
          {[serviceType, summary, callerPhone, businessName]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
