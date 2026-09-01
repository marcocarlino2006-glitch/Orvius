"use client";

import Link from "next/link";
import { useState } from "react";

type LeadQuickActionsProps = {
  leadId: string;
  phone: string | null;
  status: string;
  onStatusChange?: (status: string) => void;
};

export function LeadQuickActions({
  leadId,
  phone,
  status,
  onStatusChange,
}: LeadQuickActionsProps) {
  const [loading, setLoading] = useState(false);

  async function markContacted(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (status !== "new" || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contacted" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      onStatusChange?.("contacted");
    } catch {
      /* silent — owner can update on detail */
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lead-quick-actions font-sans" onClick={(e) => e.stopPropagation()}>
      {phone ? (
        <>
          <a href={`tel:${phone}`} className="lead-quick-btn lead-quick-btn-primary">
            Call
          </a>
          <a href={`sms:${phone}`} className="lead-quick-btn">
            Text
          </a>
        </>
      ) : null}
      {status === "new" ? (
        <button
          type="button"
          className="lead-quick-btn lead-quick-btn-signal"
          disabled={loading}
          onClick={markContacted}
        >
          {loading ? "…" : "Contacted"}
        </button>
      ) : null}
      <Link href={`/dashboard/inbox/${leadId}`} className="lead-quick-btn">
        Open
      </Link>
    </div>
  );
}
