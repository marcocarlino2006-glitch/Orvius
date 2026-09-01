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
  return status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

  return (
    <Link href={`/dashboard/calls/${id}`} className="call-record-card pro-card">
      <div className="call-record-card-header">
        <span className="call-record-card-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2.5 1.75h2.25L6.25 4.5a7.5 7.5 0 0 0 3.25 3.25l2.75 1.5v2.25a1 1 0 0 1-1.1 1 10.5 10.5 0 0 1-4.65-1.65 10.5 10.5 0 0 1-3.3-3.3A10.5 10.5 0 0 1 1.5 2.85a1 1 0 0 1 1-1.1Z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="call-record-card-head-copy">
          <div className="call-record-card-title-row">
            <h3 className="call-record-card-title font-sans">
              {leadName ?? callerPhone ?? "Unknown caller"}
            </h3>
            <div className="call-record-card-badges">
              <ShellBadge tone={statusTone(status)}>{formatStatus(status)}</ShellBadge>
              {emergency ? <ShellBadge tone="flare">Emergency</ShellBadge> : null}
              {booked ? <ShellBadge tone="live">Booked</ShellBadge> : null}
              {returning ? <ShellBadge tone="neutral">Returning</ShellBadge> : null}
            </div>
          </div>
          <p className="call-record-card-meta font-sans">
            {businessName ?? "Orvius"} ·{" "}
            {new Date(createdAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {durationSec ? ` · ${durationSec}s` : ""}
          </p>
        </div>
      </div>
      {(serviceType || summary) ? (
        <div className="call-record-card-body font-sans">
          {serviceType ? <p className="call-record-service">{serviceType}</p> : null}
          {summary ? <p className="call-record-summary">{summary}</p> : null}
        </div>
      ) : null}
    </Link>
  );
}
