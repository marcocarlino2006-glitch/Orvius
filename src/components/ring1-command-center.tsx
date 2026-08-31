"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import {
  ProEmptyState,
  ProSectionHead,
  ProStatRow,
} from "@/components/pro-page-chrome";
import { Ring1LiveStrip } from "@/components/ring1-live-strip";
import { Ring1RecentCallRow } from "@/components/ring1-recent-call-row";
import { Ring1TrustStrip } from "@/components/ring1-trust-strip";
import { DEMO_LINE_DISPLAY, demoLineHref, telHref } from "@/lib/demo-line";

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
};

const REFRESH_MS = 30_000;

function formatRelative(iso: string | null) {
  if (!iso) return "No calls yet";
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

  const line = data?.business?.line ?? DEMO_LINE_DISPLAY;
  const lineHref = data?.business?.line ? telHref(line) : demoLineHref();
  const m = data?.metrics;
  const businessName = data?.business?.name ?? null;

  const stats = loading && !data
    ? [
        { label: "Calls today", value: "—" },
        { label: "Leads today", value: "—" },
        { label: "New in inbox", value: "—", highlight: true },
        { label: "Answer rate", value: "—" },
      ]
    : [
        { label: "Calls today", value: m?.callsToday ?? 0 },
        { label: "Leads today", value: m?.leadsToday ?? 0 },
        { label: "New in inbox", value: m?.newLeads ?? 0, highlight: true },
        {
          label: "Answer rate",
          value: m?.answerRate != null ? `${m.answerRate}%` : "100%",
        },
        {
          label: "Last call",
          value: formatRelative(m?.lastCallAt ?? null),
        },
      ];

  return (
    <section className="ring1-command" aria-label="Operations overview">
      <Ring1TrustStrip businessName={businessName} line={line} />
      <Ring1LiveStrip showInboxLink />

      <ProStatRow stats={stats} className="ring1-command-stats" />

      <div className="ring1-activity">
        <div className="ring1-recent">
          <ProSectionHead
            kicker="Inbox"
            title="Latest leads"
            action={
              <Link href="/dashboard/inbox" className="pro-section-link font-sans">
                Open inbox →
              </Link>
            }
          />

          {!data?.recentLeads?.length ? (
            <ProEmptyState
              title="No leads yet"
              body="Call your live line. Every qualified lead appears here with service, urgency, and callback."
              action={
                <a href={lineHref} className="btn btn-void text-sm">
                  Call {line}
                </a>
              }
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
                    channel={lead.source === "sms" ? "SMS" : "Inbound call"}
                    status={lead.status}
                    createdAt={lead.createdAt}
                    returning={lead.returning}
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
                Call log →
              </Link>
            }
          />

          {!data?.recentCalls?.length ? (
            <ProEmptyState
              compact
              title="No calls recorded"
              body="Transcripts and lead links appear here after every inbound call."
              action={
                <a href={lineHref} className="btn btn-secondary text-sm">
                  Test line
                </a>
              }
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
