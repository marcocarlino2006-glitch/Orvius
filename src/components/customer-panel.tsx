"use client";

import { RecordLink } from "@/components/record-drawer";
import { customerVisit } from "@/lib/customer-opening";
import type { PropertyHistory, TimelineEvent } from "@/lib/customer";
import { formatCents } from "@/lib/money";
import { isRecordType } from "@/lib/record-types";
import { formatWhen } from "@/lib/when";
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
    equipment?: Array<{ name: string; brand: string; model: string; notes: string }>;
  };
  timeline: TimelineEvent[];
  properties: PropertyHistory[];
  timezone?: string | null;
};

const KIND: Record<TimelineEvent["type"], string> = {
  call: "Call",
  lead: "Request",
  job: "Job",
  estimate: "Estimate",
  invoice: "Invoice",
  payment: "Payment",
  text: "Text",
};

function when(iso: string, timezone?: string | null) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

/** Timeline and property history for one customer, beside the list. */
export function CustomerPanel({ customerId, name }: { customerId: string; name: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setError(null);
    fetch(`/api/customers/${customerId}`, signal ? { signal } : undefined)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "This customer is no longer on file." : "Customer history did not load.");
        return res.json();
      })
      .then((data: Detail) => {
        if (signal?.aborted || data?.customer?.id !== customerId) return;
        setDetail(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Customer history did not load.");
      });
  }, [customerId]);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (error) {
    return (
      <aside className="cp-panel" aria-label="Customer history">
        <div className="ox-state ox-state--failure ox-state--inline" role="alert">
          <p className="ox-state-title">History unavailable</p>
          <p className="ox-state-copy">{error}</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => load()}>
            Retry
          </button>
        </div>
      </aside>
    );
  }

  if (!detail || detail.customer.id !== customerId) {
    return (
      <aside className="cp-panel" aria-label={`${name} history`} aria-busy="true">
        <header className="cp-head">
          <h2 className="cp-name">{name}</h2>
        </header>
        <section className="cp-section" aria-label="Machine">
          <p className="cp-label">Machine</p>
          <span className="skeleton cp-skel" />
        </section>
        <section className="cp-section" aria-label="Next visit">
          <p className="cp-label">Next visit</p>
          <span className="skeleton cp-skel" />
        </section>
      </aside>
    );
  }

  const { customer, timeline, properties, timezone } = detail;
  const paid = properties.reduce((sum, p) => sum + p.paidCents, 0);
  const events = [...timeline].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const machines = (customer.equipment ?? [])
    .map((row) => [row.brand, row.name, row.model].filter(Boolean).join(" "))
    .filter(Boolean);
  const visit = customerVisit(timeline);

  return (
    <aside className="cp-panel" aria-label={`${customer.displayName} history`}>
      <header className="cp-head">
        <div>
          <h2 className="cp-name">{customer.displayName}</h2>
          <p className="cp-meta">
            Customer since {when(customer.firstSeenAt, timezone)} · {customer.callCount} call{customer.callCount === 1 ? "" : "s"} ·{" "}
            {customer.jobCount} job{customer.jobCount === 1 ? "" : "s"}
            {paid ? ` · ${formatCents(paid)} paid` : ""}
          </p>
        </div>
        <RecordLink type="customer" id={customer.id} href={`/dashboard/customers/${customer.id}`} className="ox-btn ox-btn--quiet ox-btn--sm">
          Open record
        </RecordLink>
      </header>

      <section className="cp-section" aria-label="Machine">
        <p className="cp-label">Machine</p>
        <p className="cp-meta">{machines.length ? machines.join(" · ") : "No machine on file."}</p>
      </section>
      <section className="cp-section" aria-label="Next visit">
        <p className="cp-label">Next visit</p>
        <p className="cp-meta">
          {visit ? `${visit.late ? "Late. " : ""}${formatWhen(visit.at, new Date(), timezone)}. ${visit.title.replace(/[.!?]+$/, "")}.` : "No visit booked."}
        </p>
      </section>

      <section className="cp-section" aria-label="Properties">
        <p className="cp-label">Properties</p>
        {properties.length ? (
          <ul className="cp-props">
            {properties.map((p) => (
              <li key={p.address} className="cp-prop">
                <p className="cp-prop-addr">{p.address}</p>
                <p className="cp-meta">
                  {p.jobCount ? `${p.jobCount} job${p.jobCount === 1 ? "" : "s"}` : "No jobs yet"}
                  {p.lastService && p.lastAt ? ` · last: ${p.lastService}, ${when(p.lastAt, timezone)}` : ""}
                  {p.nextAt ? ` · next visit ${when(p.nextAt, timezone)}` : ""}
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
                    {when(e.at, timezone)}
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
