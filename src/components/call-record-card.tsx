"use client";

import { RecordLink } from "@/components/record-drawer";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { displayPhone, normalizePhone } from "@/lib/customer";
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
  quality?: { verdict: "clean" | "listen" | "fix"; headline: string };
};

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Dana called about: No heat." beside "No heat" says the same thing twice. */
function summaryAddsSomething(
  summary: string | null,
  serviceType: string | null | undefined,
  leadName: string | null | undefined,
) {
  if (!summary?.trim()) return false;
  if (!serviceType?.trim()) return true;
  let rest = squash(summary).replace(squash(serviceType), " ");
  if (leadName?.trim()) rest = rest.replace(squash(leadName), " ");
  rest = rest.replace(/(called|calling|about|caller|the|a|an|re|regarding)/g, " ").trim();
  return rest.length > 12;
}

/** The call was answered and ended normally — the unremarkable outcome. */
function isSettled(status: string) {
  const s = status.trim().toLowerCase();
  return s === "completed" || s === "ended";
}

function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s === "failed" || s === "busy" || s === "no-answer") return "risk";
  if (s === "in-progress" || s === "ringing") return "live";
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
  quality,
}: CallRecordCardProps) {
  const emergency = isEmergency(urgency);
  const when = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const phone = callerPhone ? displayPhone(normalizePhone(callerPhone) ?? callerPhone) : null;
  const need = [serviceType, summaryAddsSomething(summary, serviceType, leadName) ? summary : null]
    .filter(Boolean)
    .join(". ");
  const settled = isSettled(status);
  const outcome: { tone: StatusTone; label: string } = !settled
    ? { tone: statusTone(status), label: formatStatus(status) }
    : booked
      ? { tone: "good", label: "Booked" }
      : { tone: "neutral", label: "Answered" };

  return (
    <RecordLink type="call" id={id} href={`/dashboard/calls/${id}`} className="dt-row" role="row">
      <span role="cell" className="dt-primary">
        <span className="dt-title">
          {emergency ? <span className="dt-flag">Emergency</span> : null}
          {leadName ?? phone ?? "Unknown caller"}
          {returning ? <span className="dt-tag">Returning</span> : null}
        </span>
        {need ? <span className="dt-sub">{need}</span> : null}
        {quality && quality.verdict !== "clean" ? (
          <span className={quality.verdict === "fix" ? "dt-sub is-risk" : "dt-attention"}>
            {quality.verdict === "fix" ? "Fix" : "Listen"}: {quality.headline}
          </span>
        ) : null}
      </span>
      <span role="cell">
        <StatusDot tone={outcome.tone}>{outcome.label.charAt(0).toUpperCase() + outcome.label.slice(1)}</StatusDot>
      </span>
      <span role="cell" className="dt-mono">{phone ?? <span className="dt-muted">—</span>}</span>
      <span role="cell" className="dt-when">
        <time dateTime={createdAt}>{when}</time>
      </span>
      <span role="cell" className="dt-num">
        {durationSec ? formatDuration(durationSec) : <span className="dt-muted">—</span>}
      </span>
    </RecordLink>
  );
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallTableHead() {
  return (
    <div className="dt-head" role="row">
      <span role="columnheader">Caller</span>
      <span role="columnheader">Outcome</span>
      <span role="columnheader">Phone</span>
      <span role="columnheader">Received</span>
      <span role="columnheader" className="dt-num">Length</span>
    </div>
  );
}
