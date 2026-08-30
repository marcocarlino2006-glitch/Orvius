"use client";

import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";

type LeadInboxCardProps = {
  id?: string;
  name: string;
  phone: string | null;
  service: string | null;
  urgency: string | null;
  address?: string | null;
  business: string | null;
  channel?: string;
  createdAt: string;
  customerId?: string | null;
  returning?: boolean;
  linked?: boolean;
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
  createdAt,
  customerId,
  returning = false,
  linked = true,
}: LeadInboxCardProps) {
  const emergency = isEmergency(urgency);

  const card = (
    <article className={`lead-inbox-card ${linked && id ? "lead-inbox-card-link" : ""}`}>
      <div className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            {emergency ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-flare opacity-35" />
            ) : null}
            <span
              className={`relative inline-flex size-2 rounded-full ${
                emergency ? "bg-flare" : "bg-live"
              }`}
            />
          </span>
          <p className="font-sans text-[10px] font-bold tracking-[0.22em] text-flare uppercase">
            {emergency ? "Emergency lead" : "New lead"}
          </p>
        </div>
        <time
          dateTime={createdAt}
          className="font-sans text-[10px] tracking-wide text-ash uppercase"
        >
          {new Date(createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </div>

      <div className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl tracking-[-0.035em] text-void">
              {name}
            </h3>
            <p className="mt-1 font-sans text-[13px] text-ash">
              {channel} · {business ?? "Orvius"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              { label: "Service", value: service ?? "General inquiry", href: null },
              ...(address
                ? [{ label: "Address", value: address, href: null }]
                : []),
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
                  <a
                    href={href}
                    className="lead-inbox-link tabular-nums text-flare-dim hover:text-flare"
                    onClick={(e) => e.stopPropagation()}
                  >
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
          <Link
            href={`/dashboard/customers/${customerId}`}
            className="customer-timeline-link mt-4 inline-block font-sans text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            View customer record →
          </Link>
        ) : null}

        {phone ? (
          <div className="lead-inbox-actions mt-4 flex gap-2 border-t border-rule/80 pt-4 sm:hidden">
            <a
              href={`tel:${phone}`}
              className="btn btn-void flex-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Call lead
            </a>
            <a
              href={`sms:${phone}`}
              className="btn btn-secondary flex-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Text
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );

  if (linked && id) {
    return (
      <Link href={`/dashboard/inbox/${id}`} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
