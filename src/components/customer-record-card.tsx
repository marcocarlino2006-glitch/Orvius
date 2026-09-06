import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import { customerDisplayName, displayPhone } from "@/lib/customer";

type CustomerRecordCardProps = {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  interactionCount: number;
  lastSeenAt: string;
  returning?: boolean;
};

/** Cursor-grade customer row — no avatar soft card. */
export function CustomerRecordCard({
  id,
  name,
  phone,
  email,
  address,
  interactionCount,
  lastSeenAt,
  returning = interactionCount > 1,
}: CustomerRecordCardProps) {
  const label = customerDisplayName(name, phone);
  const when = new Date(lastSeenAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <Link href={`/dashboard/customers/${id}`} className="lead-rail-row">
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          <p className="lead-rail-kind">
            Customer
            {returning ? " · returning" : ""}
            {` · ${interactionCount} touch${interactionCount === 1 ? "" : "es"}`}
          </p>
          <time dateTime={lastSeenAt} className="lead-rail-time">
            {when}
          </time>
        </div>
        <div className="lead-rail-title-row">
          <span className="lead-rail-name">{label}</span>
          <div className="lead-rail-badges">
            {returning ? <ShellBadge tone="live">Returning</ShellBadge> : null}
          </div>
        </div>
        <p className="lead-rail-sub">
          {[displayPhone(phone), address, email].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
