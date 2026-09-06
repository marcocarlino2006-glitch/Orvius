"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import { LeadQuickActions } from "@/components/lead-quick-actions";
import { LeadStatusBadge } from "@/components/lead-status-actions";

type LeadInboxCardProps = {
  id?: string;
  name: string;
  phone: string | null;
  service: string | null;
  urgency: string | null;
  address?: string | null;
  business: string | null;
  channel?: string;
  status?: string;
  createdAt: string;
  customerId?: string | null;
  returning?: boolean;
  booked?: boolean;
  onStatusChange?: (status: string) => void;
};

function formatUrgency(urgency: string | null) {
  if (!urgency) return null;
  return urgency.replace(/-/g, " ");
}

function isEmergency(urgency: string | null) {
  return urgency?.toLowerCase() === "emergency";
}

/**
 * Cursor-grade lead row — density first, not a soft marketing card.
 */
export function LeadInboxCard({
  id,
  name,
  phone,
  service,
  urgency,
  address,
  business,
  channel = "Inbound",
  status = "new",
  createdAt,
  customerId,
  returning = false,
  booked = false,
  onStatusChange,
}: LeadInboxCardProps) {
  const emergency = isEmergency(urgency);
  const when = new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article
      className={`lead-rail-row ${emergency ? "lead-rail-row-emergency" : ""}`}
    >
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          <p className={`lead-rail-kind ${emergency ? "is-flare" : ""}`}>
            {emergency
              ? "Emergency"
              : status === "new"
                ? "Needs you"
                : status.replace(/_/g, " ")}
            {returning ? " · returning" : ""}
            {booked ? " · booked" : ""}
          </p>
          <time dateTime={createdAt} className="lead-rail-time">
            {when}
          </time>
        </div>

        <div className="lead-rail-title-row">
          {id ? (
            <Link href={`/dashboard/inbox/${id}`} className="lead-rail-name">
              {name}
            </Link>
          ) : (
            <span className="lead-rail-name">{name}</span>
          )}
          <div className="lead-rail-badges">
            {status !== "new" ? <LeadStatusBadge status={status} /> : null}
            {urgency && !emergency ? (
              <ShellBadge tone="neutral">{formatUrgency(urgency)}</ShellBadge>
            ) : null}
          </div>
        </div>

        <p className="lead-rail-sub">
          {channel} · {service ?? "General inquiry"}
          {phone ? ` · ${phone}` : ""}
          {address ? ` · ${address}` : ""}
          {business ? ` · ${business}` : ""}
        </p>

        {customerId ? (
          <Link
            href={`/dashboard/customers/${customerId}`}
            className="lead-rail-record"
          >
            Customer record
          </Link>
        ) : null}
      </div>

      {id ? (
        <div className="lead-rail-actions">
          <LeadQuickActions
            leadId={id}
            phone={phone}
            status={status}
            booked={booked}
            onStatusChange={onStatusChange}
          />
        </div>
      ) : null}
    </article>
  );
}
