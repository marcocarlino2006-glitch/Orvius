"use client";

import { AppShell } from "@/components/app-shell";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import { LiveStatusBar } from "@/components/live-status-bar";
import {
  ShellAlert,
  ShellEmpty,
  ShellListItem,
  ShellPanel,
  ShellStat,
} from "@/components/shell-primitives";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { DashboardSkeleton } from "@/components/shell-skeleton";
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
    address: string | null;
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
    <AppShell
      title="Lead inbox"
      subtitle="Every call and text — captured, qualified, and ready to close."
      statusLabel="Operations"
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

      <RevealOnScroll>
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ShellStat label="Leads captured" value={data?.leadCount ?? "—"} highlight />
        <ShellStat label="Calls handled" value={data?.callCount ?? "—"} />
        <ShellStat label="Businesses" value={data?.businessCount ?? "—"} />
        <ShellStat label="Pilot waitlist" value={data?.waitlistCount ?? "—"} />
        </section>
      </RevealOnScroll>

      <section className="mb-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em] text-void">
              Recent leads
            </h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link href="/demo" className="btn btn-secondary w-full text-sm sm:w-auto">
              Run demo call
            </Link>
            <Link href="/admin" className="btn btn-primary w-full text-sm sm:w-auto">
              Manage businesses
            </Link>
          </div>
        </div>

        {!data?.recentLeads?.length ? (
          <ShellEmpty>
            No leads yet. Call your live line or run a demo to populate the
            inbox.
          </ShellEmpty>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.recentLeads.map((lead, i) => (
              <li key={lead.id}>
                <RevealOnScroll delay={i * 70}>
                  <LeadInboxCard
                  name={lead.name ?? "Unknown caller"}
                  phone={lead.phone}
                  service={lead.serviceType}
                  urgency={lead.urgency}
                  address={lead.address}
                  business={lead.business?.name ?? null}
                  createdAt={lead.createdAt}
                  />
                </RevealOnScroll>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ShellPanel title="Recent calls">
          {!data?.recentCalls?.length ? (
            <ShellEmpty>
              Calls appear here after inbound voice activity.
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

        <ShellPanel title="Pilot waitlist">
          {!data?.waitlist?.length ? (
            <ShellEmpty>
              Design partner applications appear here from /pilot.
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
        </>
      )}
    </AppShell>
  );
}
