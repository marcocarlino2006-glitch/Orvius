"use client";

import { OwnerAlertCard } from "@/components/owner-alert-card";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type CallDetail = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  booked: boolean;
  createdAt: string;
  business: { id: string; name: string } | null;
  customer: { id: string; name: string | null; phone: string; interactionCount: number } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
  } | null;
};

function formatUrgency(value: string | null) {
  if (!value) return "Flexible";
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const callId = params.id;
  const [call, setCall] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!callId) return;

    fetch(`/api/calls/${callId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Call not found");
        return res.json();
      })
      .then((data) => setCall(data.call))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [callId]);

  if (loading) {
    return (
      <OsShell title="Call" subtitle="Loading…">
        <p className="font-sans text-sm text-ash">Loading…</p>
      </OsShell>
    );
  }

  if (error || !call) {
    return (
      <OsShell title="Call" subtitle="Not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/calls" className="customer-timeline-link mt-4 inline-block font-sans">
          ← Calls
        </Link>
      </OsShell>
    );
  }

  return (
    <OsShell
      title="Inbound call"
      subtitle={`Ring 1 · ${call.business?.name ?? "Orvius"} · ${new Date(call.createdAt).toLocaleString()}`}
      businessName={call.business?.name ?? "Summit HVAC"}
      actions={
        call.callerPhone ? (
          <a href={`tel:${call.callerPhone}`} className="btn btn-void text-sm">
            Call back
          </a>
        ) : null
      }
    >
      <ProSignalBar showInboxLink={false} compact />

      <div className="ring1-lead-grid">
        <div className="ring1-lead-primary">
          {call.lead ? (
            <OwnerAlertCard
              variant="void"
              lead={{
                name: call.lead.name ?? undefined,
                phone: call.lead.phone ?? call.callerPhone ?? undefined,
                service: call.lead.serviceType ?? undefined,
                urgency: formatUrgency(call.lead.urgency),
                address: call.lead.address ?? undefined,
                channel: `Inbound call · ${call.business?.name ?? "Orvius"}`,
              }}
            />
          ) : (
            <ShellPanel title="Call summary">
              <div className="flex flex-wrap gap-2">
                <ShellBadge tone="live">{call.status}</ShellBadge>
                {call.durationSec ? (
                  <ShellBadge tone="neutral">{call.durationSec}s</ShellBadge>
                ) : null}
              </div>
              <p className="mt-4 font-sans text-sm tabular-nums text-void">
                {call.callerPhone ?? "Unknown caller"}
              </p>
              {call.summary ? (
                <p className="mt-3 font-sans text-sm leading-relaxed text-void">
                  {call.summary}
                </p>
              ) : null}
            </ShellPanel>
          )}

          {call.transcript ? (
            <TranscriptCinema transcript={call.transcript} variant="chalk" className="mt-6" />
          ) : null}

          {call.recordingUrl ? (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary mt-6 text-sm"
            >
              Play recording
            </a>
          ) : null}
        </div>

        <div className="ring1-lead-side space-y-6">
          {call.lead ? (
            <ShellPanel title="Lead">
              <Link
                href={`/dashboard/inbox/${call.lead.id}`}
                className="customer-timeline-link font-sans"
              >
                {call.lead.name ?? call.lead.serviceType ?? "View lead"} →
              </Link>
            </ShellPanel>
          ) : null}

          {call.customer ? (
            <ShellPanel title="Customer">
              <Link
                href={`/dashboard/customers/${call.customer.id}`}
                className="customer-timeline-link font-sans"
              >
                {call.customer.name ?? call.customer.phone} →
              </Link>
            </ShellPanel>
          ) : null}
        </div>
      </div>
    </OsShell>
  );
}
