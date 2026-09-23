"use client";

import { ClarityFailure, WorkflowTrail } from "@/components/clarity";
import { CustomerTimeline } from "@/components/customer-timeline";
import { OsShell } from "@/components/os-shell";
import {
  ShellBadge,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { PAGE_CLARITY, buildRecordTrail } from "@/lib/clarity";
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
      <OsShell title="Customer" clarity={PAGE_CLARITY.customers}>
        <ClarityFailure
          title="Customer not found"
          cause={error ?? "This customer record is missing or you do not have access."}
          impact="You cannot see history or call from this screen."
          recovery="Return to Customers or open the related lead from Inbox."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/customers" className="btn btn-void text-sm">
                ← All customers
              </Link>
              <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
                Inbox
              </Link>
            </div>
          }
        />
      </OsShell>
    );
  }

  const trail = buildRecordTrail({
    customerId: customer.id,
    current: "customer",
  });

  return (
    <OsShell
      title={customer.displayName}
      clarity={{
        what: "This customer is the household Orvius recognizes on the line.",
        happening: `${customer.interactionCount} touchpoint${
          customer.interactionCount === 1 ? "" : "s"
        } · ${customer.callCount} call${customer.callCount === 1 ? "" : "s"} · ${
          customer.jobCount
        } job${customer.jobCount === 1 ? "" : "s"}.`,
        next: customer.phone
          ? "Review history below, then call if you need to follow up."
          : "Add a phone number so Orvius can match the next inbound call.",
        consequence:
          "Edits here stick on the next call — returning numbers keep their history.",
        primaryHref: customer.phone ? `tel:${customer.phone}` : undefined,
        primaryLabel: customer.phone ? "Call" : undefined,
      }}
      actions={
        customer.phone ? (
          <a href={`tel:${customer.phone}`} className="btn btn-void text-sm">
            Call
          </a>
        ) : null
      }
    >
      <WorkflowTrail links={trail} className="mb-4" />

      <div className="os-detail-grid">
        <ShellPanel title="Profile" dense>
          <div className="flex flex-wrap gap-2">
            {/*
              The interaction count was a flare pill here and a Calls figure in
              the stat row twelve lines down — the same number twice, one of
              them in the colour the product reserves for emergencies.
            */}
            {customer.returning ? (
              <ShellBadge tone="live">Returning customer</ShellBadge>
            ) : (
              <ShellBadge tone="neutral">First contact</ShellBadge>
            )}
          </div>

          <dl className="os-kv font-sans">
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
            {customer.address ? (
              <div>
                <dt>Address</dt>
                <dd>{customer.address}</dd>
              </div>
            ) : null}
            <div>
              <dt>First seen</dt>
              <dd>{new Date(customer.firstSeenAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{new Date(customer.lastSeenAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div className="os-kv-stats font-sans">
            <div>
              <span className="os-kv-stats-label">Calls</span>
              <span className="os-kv-stats-value">{customer.callCount}</span>
            </div>
            <div>
              <span className="os-kv-stats-label">Leads</span>
              <span className="os-kv-stats-value">{customer.leadCount}</span>
            </div>
            <div>
              <span className="os-kv-stats-label">Jobs</span>
              <span className="os-kv-stats-value">{customer.jobCount ?? 0}</span>
            </div>
          </div>

          {customer.notes ? (
            <div className="os-kv-notes">
              <p className="os-kv-notes-label font-sans">Notes</p>
              <p className="font-sans text-sm leading-relaxed text-void whitespace-pre-wrap">
                {customer.notes}
              </p>
            </div>
          ) : null}
        </ShellPanel>

        <ShellPanel title="History" dense>
          <CustomerTimeline events={timeline} />
        </ShellPanel>
      </div>
    </OsShell>
  );
}
