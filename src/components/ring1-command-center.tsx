"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import {
  ProEmptyState,
  ProSectionHead,
  ProStatRow,
} from "@/components/pro-page-chrome";
import { ProAlertSpeedBadge } from "@/components/pro-alert-speed-badge";
import { ProAlertBanner } from "@/components/pro-alert-banner";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProPriorityBanner } from "@/components/pro-priority-banner";
import { ProShopHealth } from "@/components/pro-shop-health";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { ProOwnerStandards } from "@/components/pro-owner-standards";
import { ProWedgeReadiness } from "@/components/pro-wedge-readiness";
import { Ring1RecentCallRow } from "@/components/ring1-recent-call-row";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type Ring1Data = {
  business: { name: string; line: string | null; ownerPhone: string | null } | null;
  metrics: {
    callsToday: number;
    leadsToday: number;
    newLeads: number;
    totalCalls: number;
    totalLeads: number;
    answerRate: number | null;
    lastCallAt: string | null;
    lastCaller: string | null;
  };
  recentLeads: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
    status: string;
    source: string;
    createdAt: string;
    business: { name: string } | null;
    returning: boolean;
  }>;
  recentCalls: Array<{
    id: string;
    callerPhone: string | null;
    status: string;
    durationSec: number | null;
    createdAt: string;
    leadName: string | null;
    serviceType: string | null;
  }>;
  dispatchToday: {
    jobCount: number;
    unassigned: number;
    jobs: Array<{
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
      address: string | null;
      urgency: string | null;
      technician?: { name: string } | null;
      customer?: { name: string | null; phone: string } | null;
      lead?: { name: string | null; phone: string | null } | null;
    }>;
  };
  health?: ShopHealth;
  wedge?: WedgeReadiness;
};

const REFRESH_MS = 30_000;

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Ring1CommandCenter() {
  const [data, setData] = useState<Ring1Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      /* keep last good data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const m = data?.metrics;
  const newLeads = m?.newLeads ?? 0;

  const stats = loading && !data
    ? [
        { label: "Calls today", value: "—" },
        { label: "Leads today", value: "—" },
        { label: "Needs follow-up", value: "—", highlight: true },
        { label: "Last call", value: "—" },
      ]
    : [
        { label: "Calls today", value: m?.callsToday ?? 0 },
        { label: "Leads today", value: m?.leadsToday ?? 0 },
        {
          label: "Needs follow-up",
          value: newLeads,
          highlight: newLeads > 0,
        },
        {
          label: "Last call",
          value: formatRelative(m?.lastCallAt ?? null),
        },
      ];

  return (
    <section className="ring1-command" aria-label="Today">
      <ProPriorityBanner
        count={newLeads}
        href="/dashboard/inbox"
        actionLabel="Open inbox"
        detail="Qualified leads waiting for callback or booking."
      />

      <ProAlertBanner health={data?.health ?? null} />

      <ProWedgeReadiness readiness={data?.wedge ?? null} />

      <ProOwnerStandards health={data?.health ?? null} compact />

      <ProSignalBar />

      <ProAlertSpeedBadge health={data?.health ?? null} />

      <ProShopHealth health={data?.health} compact />

      <ProStatRow stats={stats} className="ring1-command-stats" />

      {data?.dispatchToday ? (
        <ProDispatchToday
          jobs={data.dispatchToday.jobs}
          unassigned={data.dispatchToday.unassigned}
          jobCount={data.dispatchToday.jobCount}
        />
      ) : null}

      <div className="ring1-activity">
        <div className="ring1-recent">
          <ProSectionHead
            kicker="Inbox"
            title="Latest leads"
            action={
              <Link href="/dashboard/inbox" className="pro-section-link font-sans">
                View all →
              </Link>
            }
          />

          {!data?.recentLeads?.length ? (
            <ProEmptyState
              title="No leads yet"
              body="Call your shop line. Orvius qualifies every caller and drops the lead here — service, urgency, address, and callback."
              action={<ProShopLineCta showNumber={false} />}
            />
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
                    channel={lead.source === "sms" ? "Text" : "Call"}
                    status={lead.status}
                    createdAt={lead.createdAt}
                    returning={lead.returning}
                    onStatusChange={(next) => {
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              metrics: {
                                ...prev.metrics,
                                newLeads: Math.max(
                                  0,
                                  prev.metrics.newLeads - (next === "contacted" ? 1 : 0),
                                ),
                              },
                              recentLeads: prev.recentLeads.map((item) =>
                                item.id === lead.id ? { ...item, status: next } : item,
                              ),
                            }
                          : prev,
                      );
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ring1-recent ring1-recent-calls">
          <ProSectionHead
            kicker="Calls"
            title="Recent conversations"
            action={
              <Link href="/dashboard/calls" className="pro-section-link font-sans">
                Full log →
              </Link>
            }
          />

          {!data?.recentCalls?.length ? (
            <ProEmptyState
              compact
              title="No calls yet"
              body="Every inbound call lands here with transcript and lead link."
              action={<ProShopLineCta label="Test your line" showNumber={false} variant="secondary" />}
            />
          ) : (
            <ul className="ring1-recent-call-list">
              {data.recentCalls.map((call) => (
                <li key={call.id}>
                  <Ring1RecentCallRow
                    id={call.id}
                    callerPhone={call.callerPhone}
                    leadName={call.leadName}
                    serviceType={call.serviceType}
                    status={call.status}
                    durationSec={call.durationSec}
                    createdAt={call.createdAt}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
