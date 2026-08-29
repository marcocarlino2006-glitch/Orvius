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

  return (
    <Link href={`/dashboard/customers/${id}`} className="customer-record-card">
      <div className="customer-record-head">
        <div className="customer-record-avatar font-sans" aria-hidden>
          {label.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-serif text-xl tracking-[-0.03em] text-void">
              {label}
            </h3>
            {returning ? <ShellBadge tone="live">Returning</ShellBadge> : null}
          </div>
          <p className="mt-1 font-sans text-sm text-ash tabular-nums">
            {displayPhone(phone)}
          </p>
        </div>
      </div>

      <dl className="customer-record-meta font-sans">
        <div>
          <dt>Interactions</dt>
          <dd>{interactionCount}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>
            {new Date(lastSeenAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </dd>
        </div>
        {address ? (
          <div className="customer-record-wide">
            <dt>Address</dt>
            <dd>{address}</dd>
          </div>
        ) : null}
        {email ? (
          <div className="customer-record-wide">
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
        ) : null}
      </dl>
    </Link>
  );
}
