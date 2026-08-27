"use client";

import { AppShell } from "@/components/app-shell";
import {
  ShellAlert,
  ShellEmpty,
  ShellListItem,
  ShellPanel,
  ShellStat,
} from "@/components/shell-primitives";
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
    <AppShell
      title="Operations"
      subtitle="Calls, leads, waitlist, and business activity — in one place."
      statusLabel="Founder workspace"
    >
      <div className="mb-8">
        <Link href="/admin" className="btn btn-primary">
          Manage businesses
        </Link>
      </div>

      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      <section className="mb-8 grid gap-4 md:grid-cols-4">
        <ShellStat label="Waitlist" value={data?.waitlistCount ?? "—"} highlight />
        <ShellStat label="Businesses" value={data?.businessCount ?? "—"} />
        <ShellStat label="Calls handled" value={data?.callCount ?? "—"} />
        <ShellStat label="Leads captured" value={data?.leadCount ?? "—"} />
      </section>

      <section className="mb-8">
        <ShellPanel title="Waitlist signups">
          {!data?.waitlist?.length ? (
            <ShellEmpty>
              No signups yet. Share the site or /pilot page to get your first
              design partners.
            </ShellEmpty>
          ) : (
            <ul className="space-y-3">
              {data.waitlist.map((entry) => (
                <ShellListItem
                  key={entry.id}
                  title={entry.businessName ?? entry.email}
                  meta={new Date(entry.createdAt).toLocaleString()}
                >
                  <p className="mt-1 font-sans text-sm text-ash">{entry.email}</p>
                  <p className="mt-2 font-sans text-sm text-void">
                    {[entry.trade, entry.city, entry.phone]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                </ShellListItem>
              ))}
            </ul>
          )}
        </ShellPanel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ShellPanel title="Recent calls">
          {!data?.recentCalls?.length ? (
            <ShellEmpty>
              No calls yet. Connect Vapi to your Twilio number and place a test
              call.
            </ShellEmpty>
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
                  </p>
                  {call.summary ? (
                    <p className="mt-2 font-sans text-sm leading-relaxed text-void">
                      {call.summary}
                    </p>
                  ) : null}
                </ShellListItem>
              ))}
            </ul>
          )}
        </ShellPanel>

        <ShellPanel title="Recent leads">
          {!data?.recentLeads?.length ? (
            <ShellEmpty>Leads appear here after completed calls.</ShellEmpty>
          ) : (
            <ul className="space-y-3">
              {data.recentLeads.map((lead) => (
                <ShellListItem
                  key={lead.id}
                  title={lead.name ?? "Unknown"}
                  meta={new Date(lead.createdAt).toLocaleString()}
                >
                  <p className="mt-1 font-sans text-sm text-ash">
                    {lead.business?.name ?? "Inbound"}
                  </p>
                  <p className="mt-2 font-sans text-sm text-void">
                    {lead.phone ?? "No phone"} ·{" "}
                    {lead.serviceType ?? "General inquiry"}
                  </p>
                  {lead.urgency ? (
                    <p className="mt-1 font-sans text-sm text-flare-dim">
                      Urgency: {lead.urgency}
                    </p>
                  ) : null}
                </ShellListItem>
              ))}
            </ul>
          )}
        </ShellPanel>
      </section>
    </AppShell>
  );
}
