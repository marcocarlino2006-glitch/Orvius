"use client";

import { LeadInboxCard } from "@/components/lead-inbox-card";
import { LEAD_STATUSES } from "@/components/lead-status-actions";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellEmpty } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  status: string;
  source: string;
  createdAt: string;
  business: { name: string } | null;
  customer: { id: string; interactionCount: number } | null;
  job: { id: string; status: string } | null;
};

type LeadCounts = {
  total: number;
  new: number;
  contacted: number;
  booked: number;
};

const FILTERS = [
  { value: "", label: "All" },
  ...LEAD_STATUSES.map((item) => ({ value: item.value, label: item.label })),
];

export default function InboxPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<LeadCounts | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeads = useCallback(async (statusFilter: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Failed to load inbox");
      const data = await res.json();
      setLeads(data.leads ?? []);
      setCounts(data.counts ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads(filter);
  }, [filter, loadLeads]);

  const newCount = counts?.new ?? 0;

  return (
    <OsShell
      title="Inbox"
      subtitle={
        newCount > 0
          ? `${newCount} new lead${newCount === 1 ? "" : "s"} waiting`
          : "Every qualified lead from calls and texts."
      }
      actions={
        <Link href="/demo" className="btn btn-void text-sm">
          Hear a call
        </Link>
      }
    >
      <div className="inbox-filters mb-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const count =
            item.value === ""
              ? counts?.total
              : counts?.[item.value as keyof LeadCounts];
          return (
            <button
              key={item.value || "all"}
              type="button"
              className={`btn text-sm ${
                filter === item.value ? "btn-void" : "btn-secondary"
              }`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              {typeof count === "number" ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!leads.length ? (
            <ShellEmpty>
              {filter
                ? "No leads in this filter. Try another tab or run a test call."
                : "No leads yet. Run a demo call or test your live line."}
            </ShellEmpty>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <LeadInboxCard
                    id={lead.id}
                    name={lead.name ?? "Unknown caller"}
                    phone={lead.phone}
                    service={lead.serviceType}
                    urgency={lead.urgency}
                    address={lead.address}
                    business={lead.business?.name ?? null}
                    channel={lead.source === "sms" ? "SMS" : "Inbound call"}
                    status={lead.status}
                    createdAt={lead.createdAt}
                    customerId={lead.customer?.id ?? null}
                    returning={(lead.customer?.interactionCount ?? 0) > 1}
                    booked={Boolean(lead.job)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </OsShell>
  );
}
