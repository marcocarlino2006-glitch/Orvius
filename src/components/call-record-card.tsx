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
      <div className="call-record-head">
        <div className="call-record-icon font-sans" aria-hidden>
          <span className="call-record-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="call-record-title font-serif">
              {leadName ?? callerPhone ?? "Unknown caller"}
            </h3>
            <ShellBadge tone="live">{status}</ShellBadge>
            {emergency ? <ShellBadge tone="flare">Emergency</ShellBadge> : null}
            {booked ? <ShellBadge tone="live">Booked</ShellBadge> : null}
            {returning ? <ShellBadge tone="neutral">Returning</ShellBadge> : null}
          </div>
          <p className="call-record-meta font-sans">
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
      {(serviceType || summary) && (
        <div className="call-record-body font-sans">
          {serviceType ? (
            <p className="call-record-service">{serviceType}</p>
          ) : null}
          {summary ? <p className="call-record-summary">{summary}</p> : null}
        </div>
      )}
    </Link>
  );
}
