"use client";

import { CustomerTimeline } from "@/components/customer-timeline";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellPanel } from "@/components/shell-primitives";
import { displayPhone } from "@/lib/customer";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type CustomerDetail = {
  id: string;
  displayName: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  interactionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  returning: boolean;
  business: { id: string; name: string } | null;
  leadCount: number;
  callCount: number;
  jobCount: number;
};

type TimelineEvent = {
  id: string;
  type: "call" | "lead" | "job";
  at: string;
  title: string;
  summary: string | null;
  source: string | null;
  urgency: string | null;
  status: string | null;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;

    fetch(`/api/customers/${customerId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Customer not found");
        return res.json();
      })
      .then((data) => {
        setCustomer(data.customer);
        setTimeline(data.timeline ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <OsShell title="Customer" subtitle="Loading record…">
        <p className="font-sans text-sm text-ash">Loading…</p>
      </OsShell>
    );
  }

  if (error || !customer) {
    return (
      <OsShell title="Customer" subtitle="Record not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/customers" className="customer-timeline-link mt-4 inline-block font-sans">
          ← All customers
        </Link>
      </OsShell>
    );
  }

  return (
    <OsShell
      title={customer.displayName}
      subtitle={`Customer record · ${customer.business?.name ?? "Orvius"}`}
      actions={
        customer.phone ? (
          <a href={`tel:${customer.phone}`} className="btn btn-void text-sm">
            Call
          </a>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ShellPanel title="Profile">
          <div className="flex flex-wrap gap-2">
            {customer.returning ? (
              <ShellBadge tone="live">Returning customer</ShellBadge>
            ) : (
              <ShellBadge tone="neutral">First contact</ShellBadge>
            )}
            <ShellBadge tone="flare">{customer.interactionCount} interactions</ShellBadge>
          </div>

          <dl className="mt-6 space-y-4 font-sans text-sm">
            <div>
              <dt className="text-ash">Phone</dt>
              <dd className="mt-1 font-medium tabular-nums text-void">
                {displayPhone(customer.phone)}
              </dd>
            </div>
            {customer.email ? (
              <div>
                <dt className="text-ash">Email</dt>
                <dd className="mt-1 font-medium text-void">{customer.email}</dd>
              </div>
            ) : null}
            {customer.address ? (
              <div>
                <dt className="text-ash">Address</dt>
                <dd className="mt-1 font-medium text-void">{customer.address}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ash">First seen</dt>
              <dd className="mt-1 text-void">
                {new Date(customer.firstSeenAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Last seen</dt>
              <dd className="mt-1 text-void">
                {new Date(customer.lastSeenAt).toLocaleString()}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-rule pt-4">
              <div>
                <dt className="text-ash">Calls</dt>
                <dd className="mt-1 text-2xl font-semibold text-void">{customer.callCount}</dd>
              </div>
              <div>
                <dt className="text-ash">Leads</dt>
                <dd className="mt-1 text-2xl font-semibold text-void">{customer.leadCount}</dd>
              </div>
              <div>
                <dt className="text-ash">Jobs</dt>
                <dd className="mt-1 text-2xl font-semibold text-void">{customer.jobCount ?? 0}</dd>
              </div>
            </div>
          </dl>

          {customer.notes ? (
            <div className="mt-6 border-t border-rule pt-4">
              <p className="font-sans text-xs font-bold tracking-[0.14em] text-ash uppercase">
                Notes
              </p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-void whitespace-pre-wrap">
                {customer.notes}
              </p>
            </div>
          ) : null}
        </ShellPanel>

        <ShellPanel title="History">
          <CustomerTimeline events={timeline} />
        </ShellPanel>
      </div>
    </OsShell>
  );
}
