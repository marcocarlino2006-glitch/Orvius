"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import { LeadQuickActions } from "@/components/lead-quick-actions";
import { LeadStatusBadge } from "@/components/lead-status-actions";
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
  booked?: boolean;
  onStatusChange?: (status: string) => void;
};

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
  channel = "Inbound",
  status = "new",
  createdAt,
  customerId,
  returning = false,
  booked = false,
  onStatusChange,
}: LeadInboxCardProps) {
  const emergency = isEmergency(urgency);
  /*
    The kicker earns its line or it does not get one. It used to read "LEAD" on
    every row of a list of leads, which is the page's own title repeated
    seventy-six times in tracked caps.
  */
  const kicker = emergency ? "Emergency" : returning ? "Returning" : null;
  const notable = notableUrgency(urgency);
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
          {/*
            One rule across the rails: the kicker says why this row wants
            attention, the badge says what state it is in. Printing the status
            in both put "booked" above a BOOKED pill on the same line.
          */}
          {kicker ? (
            <p className={`lead-rail-kind ${emergency ? "is-flare" : ""}`}>
              {kicker}
            </p>
          ) : null}
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
            {notable ? <ShellBadge tone="neutral">{notable}</ShellBadge> : null}
          </div>
        </div>

        {/*
          What they need, first and in the row's own voice. It used to be the
          third item in a grey run-on that opened with the channel and closed
          with the shop's own name — so the most useful fact on the row was
          behind two the owner already knew.
        */}
        <p className="lead-rail-sub">
          <b className="lead-rail-need">{service ?? "General inquiry"}</b>
          {channel !== "Call" ? ` · ${channel}` : ""}
          {phone ? ` · ${phone}` : ""}
          {address ? ` · ${address}` : ""}
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
