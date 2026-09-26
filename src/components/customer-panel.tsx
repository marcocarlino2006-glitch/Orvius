"use client";

import { RecordLink } from "@/components/record-drawer";
import type { PropertyHistory, TimelineEvent } from "@/lib/customer";
import { formatCents } from "@/lib/money";
import { isRecordType } from "@/lib/record-types";
import { useCallback, useEffect, useState } from "react";

type Detail = {
  customer: {
    id: string;
    displayName: string;
    phone: string;
    email: string | null;
    firstSeenAt: string;
    callCount: number;
    jobCount: number;
  };
  timeline: TimelineEvent[];
  properties: PropertyHistory[];
};

const KIND: Record<TimelineEvent["type"], string> = {
  call: "Call",
  lead: "Request",
  job: "Job",
  estimate: "Estimate",
  invoice: "Invoice",
  payment: "Payment",
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Timeline and property history for one customer, beside the list. */
export function CustomerPanel({ customerId }: { customerId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/customers/${customerId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "This customer is no longer on file." : "Customer history did not load.");
        return res.json();
      })
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Customer history did not load."));
  }, [customerId]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  if (error) {
    return (
      <aside className="cp-panel" aria-label="Customer history">
        <div className="ox-state ox-state--failure ox-state--inline" role="alert">
          <p className="ox-state-title">History unavailable</p>
          <p className="ox-state-copy">{error}</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={load}>
            Retry
          </button>
        </div>
      </aside>
    );
  }

  if (!detail || detail.customer.id !== customerId) {
    return (
      <aside className="cp-panel" aria-label="Customer history" aria-busy="true">
        <span className="skeleton cp-skel" />
        <span className="skeleton cp-skel" />
        <span className="skeleton cp-skel cp-skel--tall" />
      </aside>
    );
  }

  const { customer, timeline, properties } = detail;
  const paid = properties.reduce((sum, p) => sum + p.paidCents, 0);
  const events = [...timeline].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);

  return (
    <aside className="cp-panel" aria-label={`${customer.displayName} history`}>
      <header className="cp-head">
        <div>
          <h2 className="cp-name">{customer.displayName}</h2>
          <p className="cp-meta">
            Customer since {when(customer.firstSeenAt)} · {customer.callCount} call{customer.callCount === 1 ? "" : "s"} ·{" "}
            {customer.jobCount} job{customer.jobCount === 1 ? "" : "s"}
            {paid ? ` · ${formatCents(paid)} paid` : ""}
          </p>
        </div>
        <RecordLink type="customer" id={customer.id} href={`/dashboard/customers/${customer.id}`} className="ox-btn ox-btn--quiet ox-btn--sm">
          Open record
        </RecordLink>
      </header>

      <section className="cp-section" aria-label="Properties">
        <p className="cp-label">Properties</p>
        {properties.length ? (
          <ul className="cp-props">
            {properties.map((p) => (
              <li key={p.address} className="cp-prop">
                <p className="cp-prop-addr">{p.address}</p>
                <p className="cp-meta">
                  {p.jobCount ? `${p.jobCount} job${p.jobCount === 1 ? "" : "s"}` : "No jobs yet"}
                  {p.lastService && p.lastAt ? ` · last: ${p.lastService}, ${when(p.lastAt)}` : ""}
                  {p.nextAt ? ` · next visit ${when(p.nextAt)}` : ""}
                  {p.paidCents ? ` · ${formatCents(p.paidCents)} paid` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cp-meta">No service address yet — the next call that captures one adds it here.</p>
        )}
      </section>

      <section className="cp-section" aria-label="Timeline">
        <p className="cp-label">Timeline</p>
        {events.length ? (
          <ol className="cp-timeline">
            {events.map((e) => {
              const body = (
                <>
                  <span className="cp-ev-kind">{KIND[e.type]}</span>
                  <span className="cp-ev-title">{e.title}</span>
                  <span className="cp-meta">
                    {when(e.at)}
                    {e.status ? ` · ${e.status.replace(/_/g, " ")}` : ""}
                    {e.summary ? ` · ${e.summary}` : ""}
                  </span>
                </>
              );
              return (
                <li key={`${e.type}-${e.id}`} className={`cp-ev cp-ev--${e.type}`}>
                  {isRecordType(e.type) ? (
                    <RecordLink type={e.type} id={e.id} href={`/dashboard/${e.type === "lead" ? "inbox" : `${e.type}s`}/${e.id}`} className="cp-ev-link">
                      {body}
                    </RecordLink>
                  ) : (
                    <div className="cp-ev-link">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="cp-meta">Nothing recorded yet.</p>
        )}
      </section>
    </aside>
  );
}
