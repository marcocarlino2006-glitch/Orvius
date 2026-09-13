"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import { isEmergency } from "@/lib/urgency";

type CallRecordCardProps = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  durationSec: number | null;
  booked: boolean;
  createdAt: string;
  leadName?: string | null;
  serviceType?: string | null;
  urgency?: string | null;
  returning?: boolean;
};

/** The call was answered and ended normally — the unremarkable outcome. */
function isSettled(status: string) {
  const s = status.trim().toLowerCase();
  return s === "completed" || s === "ended";
}

function statusTone(status: string): "live" | "flare" | "neutral" | "muted" {
  const s = status.toLowerCase();
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
  leadName,
  serviceType,
  urgency,
  returning,
}: CallRecordCardProps) {
  const emergency = isEmergency(urgency);
  /*
    "CALL" on a row in the call log is the list's own name. What is worth a
    kicker is the exception: it was an emergency, it turned into a job, or the
    caller had rung before.
  */
  const kicker = emergency
    ? "Emergency"
    : booked
      ? "Booked"
      : returning
        ? "Returning"
        : null;
  const when = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const rest = [summary, callerPhone].filter(Boolean).join(" · ");
  const settled = isSettled(status);

  return (
    <Link
      href={`/dashboard/calls/${id}`}
      className={`lead-rail-row${emergency ? " lead-rail-row-emergency" : ""}`}
    >
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          {/*
            The status lives in the badge beside the caller's name. Naming it
            here too printed "Call · completed" above a COMPLETED pill on the
            same row, which reads as two different facts until you notice it
            is one.
          */}
          {kicker ? (
            <p className={`lead-rail-kind ${emergency ? "is-flare" : ""}`}>
              {kicker}
            </p>
          ) : null}
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
            {/*
              A call that completed is what every row in a call log is, so the
              pill was COMPLETED sixteen times down the page. The states worth
              a badge are the ones that cost the shop a customer: failed, busy,
              no answer, still ringing. Emergency is not repeated here either —
              the kicker and the row's left edge already say it.
            */}
            {settled ? null : (
              <ShellBadge tone={statusTone(status)}>
                {formatStatus(status)}
              </ShellBadge>
            )}
          </div>
        </div>
        {/* The shop's own name was the last thing on every row of its own
            call log. */}
        <p className="lead-rail-sub">
          {serviceType ? <b className="lead-rail-need">{serviceType}</b> : null}
          {serviceType && rest ? " · " : ""}
          {rest}
        </p>
      </div>
    </Link>
  );
}
