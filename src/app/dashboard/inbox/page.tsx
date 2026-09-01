"use client";

import { LeadInboxCard } from "@/components/lead-inbox-card";
import { ProPageStrip } from "@/components/pro-page-strip";
import { LEAD_STATUSES } from "@/components/lead-status-actions";
import {
  ProFilterBar,
  ProStatRow,
  ProEmptyState,
} from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
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
          ? `${newCount} lead${newCount === 1 ? "" : "s"} need your follow-up`
          : "Qualified leads from every call and text."
      }
      actions={
        <ProShopLineCta label="Call your line" showNumber={false} />
      }
    >
      <ProPageStrip followUpCount={newCount} />

      {counts ? (
        <ProStatRow
          className="pro-page-stats"
          stats={[
            { label: "Total", value: counts.total },
            { label: "Needs follow-up", value: counts.new, highlight: counts.new > 0 },
            { label: "Contacted", value: counts.contacted },
            { label: "Booked", value: counts.booked },
          ]}
        />
      ) : null}

      <ProFilterBar
        className="pro-page-filters"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((item) => ({
          value: item.value,
          label: item.label,
          count:
            item.value === ""
              ? counts?.total
              : counts?.[item.value as keyof LeadCounts],
        }))}
      />

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
            <ProEmptyState
              title={filter ? "Nothing in this filter" : "No leads yet"}
              body={
                filter
                  ? "Try another status or place a test call on your shop line."
                  : "When someone calls, Orvius captures service, urgency, address, and callback — then drops it here."
              }
              action={<ProShopLineCta showNumber={false} />}
            />
          ) : (
            <ul className="ring1-lead-grid">
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
                    channel={lead.source === "sms" ? "Text" : "Call"}
                    status={lead.status}
                    createdAt={lead.createdAt}
                    customerId={lead.customer?.id ?? null}
                    returning={(lead.customer?.interactionCount ?? 0) > 1}
                    booked={Boolean(lead.job)}
                    onStatusChange={(next) => {
                      setLeads((prev) =>
                        prev.map((item) =>
                          item.id === lead.id ? { ...item, status: next } : item,
                        ),
                      );
                      if (next === "contacted" && counts) {
                        setCounts({
                          ...counts,
                          new: Math.max(0, counts.new - 1),
                          contacted: counts.contacted + 1,
                        });
                      }
                    }}
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
