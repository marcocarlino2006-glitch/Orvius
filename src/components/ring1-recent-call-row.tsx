"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";

type Ring1RecentCallRowProps = {
  id: string;
  callerPhone: string | null;
  leadName: string | null;
  serviceType: string | null;
  status: string;
  durationSec: number | null;
  createdAt: string;
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

export function Ring1RecentCallRow({
  id,
  callerPhone,
  leadName,
  serviceType,
  status,
  durationSec,
  createdAt,
}: Ring1RecentCallRowProps) {
  const title = leadName ?? callerPhone ?? "Unknown caller";

  return (
    <Link href={`/dashboard/calls/${id}`} className="ring1-recent-call font-sans">
      <span className="ring1-recent-call-icon" aria-hidden>
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
      <span className="ring1-recent-call-main">
        <span className="ring1-recent-call-title">{title}</span>
        <span className="ring1-recent-call-meta">
          {serviceType ?? "Inbound"}
          {durationSec ? ` · ${durationSec}s` : ""}
          {" · "}
          {new Date(createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </span>
      <ShellBadge tone={statusTone(status)}>{formatStatus(status)}</ShellBadge>
    </Link>
  );
}
