"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DashboardData = {
  businessCount: number;
  callCount: number;
  leadCount: number;
  waitlistCount: number;
  recentCalls: Array<{
    id: string;
    callerPhone: string | null;
    status: string;
    summary: string | null;
    createdAt: string;
    business: { name: string } | null;
  }>;
  recentLeads: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    serviceType: string | null;
    urgency: string | null;
    createdAt: string;
    business: { name: string } | null;
  }>;
  waitlist: Array<{
    id: string;
    email: string;
    businessName: string | null;
    phone: string | null;
    trade: string | null;
    city: string | null;
    createdAt: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
            Orvius
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Operations Dashboard</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Monitor calls, leads, and business setup for your AI receptionist.
          </p>
        </div>
        <Link href="/admin" className="btn btn-primary">
          Manage businesses
        </Link>
      </header>

      {error && (
        <div className="card mb-6 border-red-500/40 p-4 text-red-300">
          {error}
        </div>
      )}

      <section className="mb-8 grid gap-4 md:grid-cols-4">
        <StatCard label="Waitlist" value={data?.waitlistCount ?? "—"} />
        <StatCard label="Businesses" value={data?.businessCount ?? "—"} />
        <StatCard label="Calls handled" value={data?.callCount ?? "—"} />
        <StatCard label="Leads captured" value={data?.leadCount ?? "—"} />
      </section>

      <section className="mb-8">
        <Panel title="Waitlist signups">
          {!data?.waitlist?.length ? (
            <EmptyState text="No signups yet. Share the site or /pilot page to get your first design partners." />
          ) : (
            <ul className="space-y-3">
              {data.waitlist.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{entry.businessName ?? entry.email}</p>
                    <span className="text-xs text-muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{entry.email}</p>
                  <p className="mt-2 text-sm">
                    {[entry.trade, entry.city, entry.phone].filter(Boolean).join(" · ") ||
                      "No details yet"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent calls">
          {!data?.recentCalls?.length ? (
            <EmptyState text="No calls yet. Connect Vapi to your Twilio number and place a test call." />
          ) : (
            <ul className="space-y-3">
              {data.recentCalls.map((call) => (
                <li key={call.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{call.business?.name ?? "Unknown"}</p>
                    <span className="text-xs text-muted">
                      {new Date(call.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {call.callerPhone ?? "Unknown caller"} · {call.status}
                  </p>
                  {call.summary && (
                    <p className="mt-2 text-sm leading-relaxed">{call.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent leads">
          {!data?.recentLeads?.length ? (
            <EmptyState text="Leads appear here after completed calls." />
          ) : (
            <ul className="space-y-3">
              {data.recentLeads.map((lead) => (
                <li key={lead.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{lead.name ?? "Unknown"}</p>
                    <span className="text-xs text-muted">
                      {new Date(lead.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{lead.business?.name ?? "Inbound"}</p>
                  <p className="mt-2 text-sm">
                    {lead.phone ?? "No phone"} · {lead.serviceType ?? "General inquiry"}
                  </p>
                  {lead.urgency && (
                    <p className="mt-1 text-sm text-amber-300">
                      Urgency: {lead.urgency}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm leading-relaxed text-muted">{text}</p>;
}
