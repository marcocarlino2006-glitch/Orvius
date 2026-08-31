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
        <span className="call-record-pulse" />
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
      <ShellBadge tone="live">{status}</ShellBadge>
    </Link>
  );
}
