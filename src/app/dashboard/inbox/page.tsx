"use client";

import { ClarityEmpty, ClarityFailure } from "@/components/clarity";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import { ProLead } from "@/components/pro-lead";
import { LEAD_STATUSES } from "@/components/lead-status-actions";
import {
  ProFilterBar,
  ProListEnd,
} from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { PAGE_CLARITY } from "@/lib/clarity";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  customer: { id: string; interactionCount: number } | null;
  job: { id: string; status: string } | null;
};

type LeadCounts = {
  total: number;
  new: number;
  contacted: number;
  booked: number;
  lost: number;
  spam: number;
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

  const clarity = useMemo(
    () => ({
      ...PAGE_CLARITY.inbox,
      happening:
        newCount > 0
          ? `${newCount} new lead${newCount === 1 ? "" : "s"} waiting — newest first.`
          : PAGE_CLARITY.inbox.happening,
      next:
        newCount > 0
          ? "Open the top new lead and call them back."
          : PAGE_CLARITY.inbox.next,
      primaryHref: newCount > 0 && leads[0] ? `/dashboard/inbox/${leads[0].id}` : undefined,
      primaryLabel: newCount > 0 && leads[0] ? "Open top lead" : undefined,
    }),
    [newCount, leads],
  );

  return (
    <OsShell
      title="Inbox"
      clarity={clarity}
      subtitle={
        newCount > 0
          ? `${newCount} lead${newCount === 1 ? "" : "s"} need your follow-up`
          : "Qualified leads from every call and text."
      }
      actions={
        <ProShopLineCta label="Call your line" showNumber={false} />
      }
    >
      <ProLead
        loading={loading && !counts}
        figure={String(newCount)}
        caption={
          newCount === 1 ? "lead needs a callback" : "leads need a callback"
        }
        detail={
          newCount > 0
            ? "Captured while you were on a job. Newest first."
            : "Everyone who called has been answered."
        }
      />

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
              <ClarityFailure
                title="Inbox could not load"
                cause={error}
                impact="New leads may be waiting while this list is blank."
                recovery="Retry the load, or place a test call to confirm capture still works."
                action={
                  <button
                    type="button"
                    className="btn btn-void text-sm"
                    onClick={() => void loadLeads(filter)}
                  >
                    Retry
                  </button>
                }
              />
            </div>
          ) : null}

          {!leads.length ? (
            <ClarityEmpty
              title={filter ? "Nothing in this filter" : "No leads yet"}
              body={
                filter
                  ? "This status is empty right now. Switch filters or place a test call on your shop line."
                  : "When someone calls, Orvius captures service, urgency, address, and callback — then drops it here."
              }
              next={
                filter
                  ? "Clear the filter or call your line once to prove capture."
                  : "Call your shop line once so you can see how a lead lands."
              }
              consequence="A successful test call means after-hours callers become bookable work instead of voicemail."
              action={<ProShopLineCta showNumber={false} />}
            />
          ) : (
            <ul className="os-lead-rail">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <LeadInboxCard
                    id={lead.id}
                    name={lead.name ?? "Unknown caller"}
                    phone={lead.phone}
                    service={lead.serviceType}
                    urgency={lead.urgency}
                    address={lead.address}
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
          {leads.length ? (
            <ProListEnd count={leads.length} noun="lead"
                scope={filter ? FILTERS.find((f) => f.value === filter)?.label.toLowerCase() : undefined} />
          ) : null}
        </>
      )}
    </OsShell>
  );
}
