"use client";

import { RecordLink } from "@/components/record-drawer";
import { LeadQuickActions } from "@/components/lead-quick-actions";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { isEmergency, notableUrgency } from "@/lib/urgency";

type LeadInboxCardProps = {
  id?: string;
  name: string;
  phone: string | null;
  service: string | null;
  urgency: string | null;
  address?: string | null;
  channel?: string;
  status?: string;
  createdAt: string;
  customerId?: string | null;
  returning?: boolean;
  jobId?: string | null;
  onBooked?: (jobId: string) => void;
};

const STATUS_TONE: Record<string, StatusTone> = {
  new: "attention",
  contacted: "live",
  booked: "good",
  lost: "muted",
  spam: "muted",
};

export function LeadInboxCard({
  id,
  name,
  phone,
  service,
  urgency,
  address,
  channel = "Inbound",
  status = "new",
  createdAt,
  returning = false,
  jobId = null,
  onBooked,
}: LeadInboxCardProps) {
  const emergency = isEmergency(urgency);
  const notable = notableUrgency(urgency);
  const phoneLabel = phone
    ? displayPhone(normalizePhone(phone) ?? phone)
    : null;
  const when = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const statusTone = STATUS_TONE[status] ?? "neutral";
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div className="dt-row" role="row">
      <span role="cell" className="dt-primary">
        <span className="dt-title">
          {emergency ? <span className="dt-flag">Emergency</span> : null}
          {id ? (
            <RecordLink type="lead" id={id} href={`/dashboard/inbox/${id}`} className="dt-link">
              {name}
            </RecordLink>
          ) : (
            name
          )}
          {returning ? <span className="dt-tag">Returning</span> : null}
        </span>
        <span className="dt-sub">
          {[service ?? "General inquiry", channel !== "Call" ? channel : null, address].filter(Boolean).join(", ")}
        </span>
      </span>
      <span role="cell">
        <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
        {notable ? <span className="dt-sub">{notable.charAt(0).toUpperCase() + notable.slice(1)}</span> : null}
      </span>
      <span role="cell" className="dt-mono">{phoneLabel ?? <span className="dt-muted">—</span>}</span>
      <span role="cell" className="dt-when">
        <time dateTime={createdAt}>{when}</time>
      </span>
      <span role="cell" className="dt-actions">
        {id ? (
          <LeadQuickActions
            leadId={id}
            phone={phone}
            status={status}
            urgency={urgency}
            address={address ?? null}
            jobId={jobId}
            onBooked={onBooked}
          />
        ) : null}
      </span>
    </div>
  );
}

export function LeadTableHead() {
  return (
    <div className="dt-head" role="row">
      <span role="columnheader">Caller</span>
      <span role="columnheader">Status</span>
      <span role="columnheader">Phone</span>
      <span role="columnheader">Received</span>
      <span role="columnheader" className="dt-num">
        <span className="sr-only">Actions</span>
      </span>
    </div>
  );
}
