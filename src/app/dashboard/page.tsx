"use client";

import { CustomerRecordCard } from "@/components/customer-record-card";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import { LiveStatusBar } from "@/components/live-status-bar";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellEmpty,
  ShellListItem,
  ShellPanel,
  ShellStat,
} from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";

type DashboardData = {
  businessCount: number;
  callCount: number;
  leadCount: number;
  customerCount: number;
  waitlistCount: number;
  recentCalls: Array<{
    id: string;
    callerPhone: string | null;
    status: string;
    summary: string | null;
    createdAt: string;
    business: { name: string } | null;
    customer: { id: string; name: string | null; interactionCount: number } | null;
  }>;
  recentLeads: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
    createdAt: string;
    business: { name: string } | null;
    customer: { id: string; name: string | null; interactionCount: number } | null;
  }>;
  recentCustomers: Array<{
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    interactionCount: number;
    lastSeenAt: string;
    business: { name: string } | null;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell
      title="Overview"
      subtitle="Ring 1 + Ring 2 live — front door and customer records."
      statusLabel="Operations"
      actions={
        <Link href="/demo" className="btn btn-primary text-sm">
          Run demo call
        </Link>
      }
    >
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <LiveStatusBar />

          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <ShellStat label="Customers" value={data?.customerCount ?? "—"} highlight />
            <ShellStat label="Leads" value={data?.leadCount ?? "—"} />
            <ShellStat label="Calls" value={data?.callCount ?? "—"} />
            <ShellStat label="Businesses" value={data?.businessCount ?? "—"} />
            <ShellStat label="Pilot waitlist" value={data?.waitlistCount ?? "—"} />
          </section>

          <section className="mb-10">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Ring 2</p>
                <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em] text-void">
                  Customer records
                </h2>
              </div>
              <Link href="/dashboard/customers" className="editorial-link font-sans text-sm">
                View all customers →
              </Link>
            </div>

            {!data?.recentCustomers?.length ? (
              <ShellEmpty>
                Customers appear when calls or texts create a contact record.
              </ShellEmpty>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {data.recentCustomers.map((customer) => (
                  <li key={customer.id}>
                    <CustomerRecordCard
                      id={customer.id}
                      name={customer.name}
                      phone={customer.phone}
                      email={customer.email}
                      address={customer.address}
                      interactionCount={customer.interactionCount}
                      lastSeenAt={customer.lastSeenAt}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-10">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Ring 1</p>
                <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em] text-void">
                  Recent leads
                </h2>
              </div>
              <Link href="/dashboard/inbox" className="editorial-link font-sans text-sm">
                Open inbox →
              </Link>
            </div>

            {!data?.recentLeads?.length ? (
              <ShellEmpty>
                No leads yet. Call your live line or run a demo.
              </ShellEmpty>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {data.recentLeads.map((lead) => (
                  <li key={lead.id}>
                    <LeadInboxCard
                      id={lead.id}
                      name={lead.name ?? "Unknown caller"}
                      phone={lead.phone}
                      service={lead.serviceType}
                      urgency={lead.urgency}
                      address={lead.address}
                      business={lead.business?.name ?? null}
                      createdAt={lead.createdAt}
                      customerId={lead.customer?.id ?? null}
                      returning={(lead.customer?.interactionCount ?? 0) > 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <ShellPanel
              title="Recent calls"
              action={
                <Link href="/dashboard/calls" className="font-sans text-xs text-ash hover:text-void">
                  View all
                </Link>
              }
            >
              {!data?.recentCalls?.length ? (
                <ShellEmpty>Calls appear after inbound voice activity.</ShellEmpty>
              ) : (
                <ul className="space-y-3">
                  {data.recentCalls.map((call) => (
                    <ShellListItem
                      key={call.id}
                      title={call.business?.name ?? "Unknown"}
                      meta={new Date(call.createdAt).toLocaleString()}
                    >
                      <p className="mt-1 font-sans text-sm text-ash">
                        {call.callerPhone ?? "Unknown caller"} · {call.status}
                        {call.customer && call.customer.interactionCount > 1
                          ? " · Returning customer"
                          : ""}
                      </p>
                      {call.summary ? (
                        <p className="mt-2 font-sans text-sm leading-relaxed text-void">
                          {call.summary}
                        </p>
                      ) : null}
                      <Link
                        href={`/dashboard/calls/${call.id}`}
                        className="customer-timeline-link mt-2 inline-block font-sans"
                      >
                        View call →
                      </Link>
                    </ShellListItem>
                  ))}
                </ul>
              )}
            </ShellPanel>

            <ShellPanel title="Quick actions">
              <ul className="space-y-3 font-sans text-sm">
                <li>
                  <Link href="/admin" className="os-quick-link">
                    Manage businesses & lines
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="os-quick-link">
                    Simulate inbound call
                  </Link>
                </li>
                <li>
                  <Link href="/pilot" className="os-quick-link">
                    Pilot applications
                  </Link>
                </li>
              </ul>
            </ShellPanel>
          </section>
        </>
      )}
    </OsShell>
  );
}
