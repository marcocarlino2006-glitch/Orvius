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

  return (
    <article
      className={`lead-inbox-card pro-card ${emergency ? "lead-inbox-card-emergency" : ""}`}
    >
      <div className="lead-inbox-card-header">
        <div className="lead-inbox-card-kicker-row">
          {emergency ? (
            <span className="live-dot live-dot-flare" aria-hidden />
          ) : status === "new" ? (
            <span className="live-dot live-dot-green" aria-hidden />
          ) : null}
          <p className={`pro-kicker ${emergency ? "pro-kicker-flare" : ""}`}>
            {emergency ? "Emergency" : status === "new" ? "Needs follow-up" : "Lead"}
          </p>
        </div>
        <time dateTime={createdAt} className="lead-inbox-card-time font-sans">
          {new Date(createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </div>

      <div className="lead-inbox-card-body">
        <div className="lead-inbox-card-title-row">
          <div>
            {id ? (
              <Link href={`/dashboard/inbox/${id}`} className="lead-inbox-name-link">
                <h3 className="lead-inbox-card-name font-sans">{name}</h3>
              </Link>
            ) : (
              <h3 className="lead-inbox-card-name font-sans">{name}</h3>
            )}
            <p className="lead-inbox-card-sub font-sans">
              {channel} · {service ?? "General inquiry"}
            </p>
          </div>
          <div className="lead-inbox-card-badges">
            {status !== "new" ? <LeadStatusBadge status={status} /> : null}
            {booked ? <ShellBadge tone="live">Booked</ShellBadge> : null}
            {urgency ? (
              <ShellBadge tone={emergency ? "flare" : "neutral"}>
                {formatUrgency(urgency)}
              </ShellBadge>
            ) : null}
            {returning ? <ShellBadge tone="live">Returning</ShellBadge> : null}
          </div>
        </div>

        <dl className="lead-inbox-details mt-5 space-y-0 font-sans text-[13px]">
          {(
            [
              { label: "Phone", value: phone ?? "Unknown", href: phone ? `tel:${phone}` : null },
              ...(address ? [{ label: "Address", value: address, href: null }] : []),
            ] as { label: string; value: string; href: string | null }[]
          ).map(({ label, value, href }, i, arr) => (
            <div
              key={label}
              className={`lead-inbox-detail flex justify-between gap-4 py-2.5 ${
                i < arr.length - 1 ? "border-b border-rule/80" : ""
              }`}
            >
              <dt className="text-ash">{label}</dt>
              <dd className="text-right font-medium text-void">
                {href ? (
                  <a href={href} className="lead-inbox-link tabular-nums text-flare-dim hover:text-flare">
                    {value}
                  </a>
                ) : (
                  <span className="lead-inbox-value">{value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {customerId ? (
          <Link href={`/dashboard/customers/${customerId}`} className="customer-timeline-link mt-4 inline-block font-sans text-xs">
            Customer record →
          </Link>
        ) : null}

        {id ? (
          <LeadQuickActions
            leadId={id}
            phone={phone}
            status={status}
            booked={booked}
            onStatusChange={onStatusChange}
          />
        ) : null}
      </div>
    </article>
  );
}
