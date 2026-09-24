"use client";

import { RecordLink } from "@/components/record-drawer";
import { RecordAvatar } from "@/components/record-avatar";
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
  /** Wide layouts show history beside the list; the drawer stays for narrow ones. */
  onSelect?: () => void;
  selected?: boolean;
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
  onSelect,
  selected = false,
}: CustomerRecordCardProps) {
  const label = customerDisplayName(name, phone);
  const when = new Date(lastSeenAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`cp-row${selected ? " is-selected" : ""}`}
      onClickCapture={(event) => {
        if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (!window.matchMedia("(min-width: 1100px)").matches) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
    <RecordLink type="customer" id={id} href={`/dashboard/customers/${id}`} className="lead-rail-row">
      <RecordAvatar name={label} />
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          {returning ? (
            <p className="lead-rail-count is-live">{interactionCount} touchpoints</p>
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
    </RecordLink>
    </div>
  );
}
