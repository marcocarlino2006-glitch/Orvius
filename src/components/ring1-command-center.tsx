"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LeadInboxCard } from "@/components/lead-inbox-card";
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

const flow = [
  { step: "01", title: "Answer", body: "Every call picked up — nights, weekends, peak." },
  { step: "02", title: "Qualify", body: "Service, urgency, address, callback — captured clean." },
  { step: "03", title: "Alert", body: "Owner SMS in under 60 seconds with a deep link." },
  { step: "04", title: "Inbox", body: "Lead in the OS. One tap to call back or book." },
];

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

function MetricSkeleton() {
  return (
    <div className="ring1-metric ring1-metric-loading" aria-hidden>
      <div className="ring1-shimmer ring1-shimmer-value" />
      <div className="ring1-shimmer ring1-shimmer-label" />
    </div>
  );
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
  const businessName = data?.business?.name ?? "Summit HVAC";

  return (
    <section className="ring1-command" aria-label="Ring 1 front door">
      <Ring1TrustStrip businessName={businessName} />

      <div className="ring1-command-hero">
        <div className="ring1-command-hero-glow" aria-hidden />
        <div className="ring1-command-hero-copy">
          <p className="ring1-command-kicker font-sans">
            <span className="home-os-live-dot" />
            Ring 01 · Front door · Live
          </p>
          <h2 className="ring1-command-title font-serif">
            Every call answered. Every lead captured.
          </h2>
          <p className="ring1-command-lead font-sans">
            {businessName} runs on Orvius. Call the line — hear the AI, watch the
            SMS, see the lead land here.
          </p>
          <div className="ring1-command-line">
            <a href={lineHref} className="ring1-command-number font-sans">
              {line}
            </a>
            <a href={lineHref} className="btn btn-on-void text-sm">
              Test live line
            </a>
          </div>
        </div>

        <div className="ring1-command-flow">
          {flow.map((item) => (
            <div key={item.step} className="ring1-flow-step">
              <span className="ring1-flow-num font-sans">{item.step}</span>
              <div>
                <p className="ring1-flow-title font-sans">{item.title}</p>
                <p className="ring1-flow-body font-sans">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ring1-metrics">
        {loading && !data ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <div className="ring1-metric">
              <p className="ring1-metric-value font-serif">{m?.callsToday ?? 0}</p>
              <p className="ring1-metric-label font-sans">Calls today</p>
            </div>
            <div className="ring1-metric">
              <p className="ring1-metric-value font-serif">{m?.leadsToday ?? 0}</p>
              <p className="ring1-metric-label font-sans">Leads today</p>
            </div>
            <div className="ring1-metric ring1-metric-highlight">
              <p className="ring1-metric-value font-serif">{m?.newLeads ?? 0}</p>
              <p className="ring1-metric-label font-sans">New in inbox</p>
            </div>
            <div className="ring1-metric">
              <p className="ring1-metric-value font-serif">
                {m?.answerRate != null ? `${m.answerRate}%` : "100%"}
              </p>
              <p className="ring1-metric-label font-sans">Answer rate</p>
            </div>
            <div className="ring1-metric ring1-metric-wide">
              <p className="ring1-metric-value font-serif ring1-metric-value-sm">
                {formatRelative(m?.lastCallAt ?? null)}
              </p>
              <p className="ring1-metric-label font-sans">
                Last call{m?.lastCaller ? ` · ${m.lastCaller}` : ""}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="ring1-activity">
        <div className="ring1-recent">
          <div className="pro-section-head">
            <div>
              <p className="pro-section-kicker font-sans">Inbox</p>
              <h3 className="pro-section-title font-serif">Latest leads</h3>
            </div>
            <Link href="/dashboard/inbox" className="pro-section-link font-sans">
              Open full inbox →
            </Link>
          </div>

          {!data?.recentLeads?.length ? (
            <div className="ring1-empty font-sans">
              <p>No leads yet. Call the live line to see Ring 1 work in real time.</p>
              <a href={lineHref} className="btn btn-void mt-4 text-sm">
                Call {line}
              </a>
            </div>
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
          <div className="pro-section-head">
            <div>
              <p className="pro-section-kicker font-sans">Calls</p>
              <h3 className="pro-section-title font-serif">Recent conversations</h3>
            </div>
            <Link href="/dashboard/calls" className="pro-section-link font-sans">
              Full call log →
            </Link>
          </div>

          {!data?.recentCalls?.length ? (
            <div className="ring1-empty ring1-empty-compact font-sans">
              <p>Every inbound call lands here with transcript and lead link.</p>
            </div>
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
