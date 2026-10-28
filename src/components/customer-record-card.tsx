"use client";

import { RecordLink } from "@/components/record-drawer";
import { customerDisplayName, displayPhone } from "@/lib/customer";
import { formatCents } from "@/lib/money";
import { formatDay } from "@/lib/when";

type CustomerRecordCardProps = {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  interactionCount: number;
  lastSeenAt: string;
  returning?: boolean;
  collectedCents?: number;
  owedCents?: number;
  refundedCents?: number;
  /** Wide layouts show history beside the list; the drawer stays for narrow ones. */
  onSelect?: () => void;
  selected?: boolean;
  timezone?: string | null;
};

function moneyLine(collected: number, owed: number, refunded: number): string | null {
  if (owed > 0) return `${formatCents(owed)} owed`;
  if (collected > 0) return `${formatCents(collected)} paid`;
  if (refunded > 0) return `${formatCents(refunded)} refunded`;
  return null;
}

/** One customer, in the same columns as Calls and Jobs. */
export function CustomerRecordCard({
  id,
  name,
  phone,
  email,
  address,
  interactionCount,
  lastSeenAt,
  returning = interactionCount > 1,
  collectedCents = 0,
  owedCents = 0,
  refundedCents = 0,
  onSelect,
  selected = false,
  timezone = null,
}: CustomerRecordCardProps) {
  const label = customerDisplayName(name, phone);
  const when = formatDay(lastSeenAt, new Date(), timezone);
  const money = moneyLine(collectedCents, owedCents, refundedCents);

  return (
    <div
      className={`dt-row dt-row--link${selected ? " is-selected" : ""}`}
      role="row"
      onClickCapture={(event) => {
        if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (!window.matchMedia("(min-width: 1480px)").matches) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
      <span role="cell" className="dt-primary">
        <RecordLink type="customer" id={id} href={`/dashboard/customers/${id}`} className="dt-title dt-row-link">
          {label}
          {returning ? <span className="dt-tag">Returning</span> : null}
        </RecordLink>
        {email ? <span className="dt-sub">{email}</span> : null}
      </span>
      <span role="cell" className="dt-mono">{displayPhone(phone)}</span>
      <span role="cell" className={`dt-address${address?.trim() ? "" : " is-empty"}`}>{address?.trim() || <span className="dt-muted">—</span>}</span>
      <span role="cell" className={owedCents > 0 ? "is-owed" : undefined}>{money ?? <span className="dt-muted">—</span>}</span>
      <span role="cell" className="dt-when">
        <time dateTime={lastSeenAt}>{when}</time>
      </span>
    </div>
  );
}

export function CustomerTableHead() {
  return (
    <div className="dt-head" role="row">
      <span role="columnheader">Customer</span>
      <span role="columnheader">Phone</span>
      <span role="columnheader">Address</span>
      <span role="columnheader">Money</span>
      <span role="columnheader">Last</span>
    </div>
  );
}
