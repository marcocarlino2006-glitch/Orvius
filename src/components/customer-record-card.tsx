import Link from "next/link";
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
          {/*
            One statement of the fact, not three. This read "Customer · returning
            · 2 touches" beside a "Returning" badge, on a page where every row is
            a customer by definition — so of four pieces of text, one was a
            tautology and two were the same claim.

            Now it is the count alone, and only when the count is interesting.
            "1 CALL" in tracked caps on ten of thirteen rows was a label the
            width of a column heading saying the least remarkable thing true of
            a customer, and the RETURNING badge beside the three that mattered
            said less than the number does.
          */}
          {returning ? (
            <p className="lead-rail-count is-live">{interactionCount} calls</p>
          ) : null}
          <time dateTime={lastSeenAt} className="lead-rail-time">
            {when}
          </time>
        </div>
        <div className="lead-rail-title-row">
          <span className="lead-rail-name">{label}</span>
        </div>
        <p className="lead-rail-sub">
          {[displayPhone(phone), address, email].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
