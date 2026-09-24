"use client";

import { LeadInboxCard } from "@/components/lead-inbox-card";
import { ProLead } from "@/components/pro-lead";
import { LEAD_STATUSES } from "@/components/lead-status-actions";
import {
  ProFilterBar,
  ProEmptyState,
  ProListEnd,
} from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import {
  describeDashboardFailure,
  readDashboardError,
  type DashboardLoadFailure,
} from "@/lib/dashboard-fetch";
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
  const [failure, setFailure] = useState<DashboardLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeads = useCallback(async (statusFilter: string) => {
    setLoading(true);
    setFailure(null);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) {
        setFailure(await readDashboardError("Inbox", res));
        setLeads([]);
        setCounts(null);
        return;
      }
      const data = await res.json();
      setLeads(data.leads ?? []);
      setCounts(data.counts ?? null);
    } catch {
      setFailure(describeDashboardFailure("Inbox", null, "Network error"));
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
      subtitle="Every lead waiting on a decision — act on the top one first."
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
          {failure ? (
            <div className="mb-6 pro-alert pro-alert-error font-sans" role="alert">
              <p className="font-medium">{failure.title}</p>
              <p className="mt-2 text-sm opacity-90">
                <strong>Cause:</strong> {failure.cause}
              </p>
              <p className="mt-1 text-sm opacity-90">
                <strong>Impact:</strong> {failure.impact}
              </p>
              <p className="mt-1 text-sm opacity-90">
                <strong>Recover:</strong> {failure.recovery}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-void text-sm"
                  onClick={() => void loadLeads(filter)}
                >
                  Retry
                </button>
                {failure.href ? (
                  <Link href={failure.href} className="btn btn-secondary text-sm">
                    {failure.hrefLabel ?? "Open"}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {!leads.length && !failure ? (
            <ProEmptyState
              title={filter ? "Nothing in this filter" : "No leads yet"}
              body={
                filter
                  ? "Try another status or place a test call on your shop line."
                  : "When someone calls, Orvius captures service, urgency, address, and callback — then drops it here. Next: call your line or run an in-app test from setup."
              }
              action={<ProShopLineCta showNumber={false} />}
            />
          ) : !leads.length ? null : (
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
                    jobId={lead.job?.id ?? null}
                    onBooked={(jobId) => {
                      setLeads((prev) =>
                        prev.map((item) =>
                          item.id === lead.id
                            ? { ...item, status: "booked", job: { id: jobId, status: "scheduled" } }
                            : item,
                        ),
                      );
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
