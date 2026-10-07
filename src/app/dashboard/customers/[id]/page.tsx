"use client";

import { CustomerTimeline } from "@/components/customer-timeline";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { displayPhone } from "@/lib/customer";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDay, formatWhen } from "@/lib/when";

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

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
  type: "call" | "lead" | "job" | "estimate" | "invoice" | "payment";
  at: string;
  title: string;
  summary: string | null;
  source: string | null;
  urgency: string | null;
  status: string | null;
  amountCents?: number | null;
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
        <ShellLoading />
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

  const paidCents = timeline.filter((e) => e.type === "payment" && (e.status ?? "").toLowerCase() !== "failed").reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
  const summary = [
    `Customer since ${formatDay(customer.firstSeenAt)}`,
    `${customer.callCount} call${customer.callCount === 1 ? "" : "s"}`,
    `${customer.jobCount ?? 0} job${customer.jobCount === 1 ? "" : "s"}`,
    paidCents ? `${usd(paidCents)} paid` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <OsShell
      title={customer.displayName}
      subtitle={summary}
      actions={
        customer.phone ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/inbox/messages?phone=${encodeURIComponent(customer.phone)}`}
              className="ox-btn ox-btn--quiet ox-btn--sm"
            >
              Text
            </Link>
            <Link
              href={`/dashboard/jobs/new?${new URLSearchParams({
                phone: customer.phone,
                ...(customer.name ? { name: customer.name } : {}),
                ...(customer.address ? { address: customer.address } : {}),
              })}`}
              className="ox-btn ox-btn--quiet ox-btn--sm"
            >
              Book a job
            </Link>
            <a href={`tel:${customer.phone}`} className="ox-btn ox-btn--primary ox-btn--sm">
              Call
            </a>
          </div>
        ) : null
      }
    >
      <div className="os-detail-grid">
        <div className="os-detail-primary">
          <ShellPanel title="Profile" dense action={customer.returning ? <span className="ct-kind ct-kind--money">Returning</span> : null}>
            <dl className="jv-facts font-sans">
              <div>
                <dt>Phone</dt>
                <dd className="tabular-nums">{displayPhone(customer.phone)}</dd>
              </div>
              {customer.email ? (
                <div>
                  <dt>Email</dt>
                  <dd>{customer.email}</dd>
                </div>
              ) : null}
              <div>
                <dt>Address</dt>
                <dd className={customer.address ? undefined : "jv-missing"}>{customer.address ?? "None on file"}</dd>
              </div>
              <div>
                <dt>Last heard from</dt>
                <dd>{formatWhen(customer.lastSeenAt)}</dd>
              </div>
              {customer.notes ? (
                <div>
                  <dt>Notes</dt>
                  <dd className="jv-notes">{customer.notes}</dd>
                </div>
              ) : null}
            </dl>
          </ShellPanel>
        </div>

        <div className="os-detail-side">
          <ShellPanel title="History" dense>
            <CustomerTimeline events={timeline} />
          </ShellPanel>
        </div>
      </div>
    </OsShell>
  );
}
