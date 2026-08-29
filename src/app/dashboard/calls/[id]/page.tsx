"use client";

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
    serviceType: string | null;
    urgency: string | null;
  } | null;
};

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
      subtitle={`${call.business?.name ?? "Orvius"} · ${new Date(call.createdAt).toLocaleString()}`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <ShellPanel title="Summary">
          <div className="flex flex-wrap gap-2">
            <ShellBadge tone="live">{call.status}</ShellBadge>
            {call.durationSec ? (
              <ShellBadge tone="neutral">{call.durationSec}s</ShellBadge>
            ) : null}
            {call.booked ? <ShellBadge tone="flare">Booked</ShellBadge> : null}
          </div>

          <dl className="mt-6 space-y-4 font-sans text-sm">
            <div>
              <dt className="text-ash">Caller</dt>
              <dd className="mt-1 font-medium tabular-nums text-void">
                {call.callerPhone ?? "Unknown"}
              </dd>
            </div>
            {call.summary ? (
              <div>
                <dt className="text-ash">Summary</dt>
                <dd className="mt-1 leading-relaxed text-void">{call.summary}</dd>
              </div>
            ) : null}
          </dl>

          {call.customer ? (
            <div className="mt-6 border-t border-rule pt-4">
              <Link
                href={`/dashboard/customers/${call.customer.id}`}
                className="customer-timeline-link font-sans"
              >
                Customer: {call.customer.name ?? call.customer.phone} →
              </Link>
            </div>
          ) : null}

          {call.lead ? (
            <div className="mt-4">
              <Link
                href={`/dashboard/inbox/${call.lead.id}`}
                className="customer-timeline-link font-sans"
              >
                Lead: {call.lead.name ?? call.lead.serviceType ?? "View lead"} →
              </Link>
            </div>
          ) : null}

          {call.recordingUrl ? (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noreferrer"
              className="customer-timeline-link mt-4 inline-block font-sans"
            >
              Play recording →
            </a>
          ) : null}
        </ShellPanel>

        <ShellPanel title="Transcript">
          {call.transcript ? (
            <pre className="max-h-[32rem] overflow-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-void">
              {call.transcript}
            </pre>
          ) : (
            <p className="font-sans text-sm text-ash">No transcript available.</p>
          )}
        </ShellPanel>
      </div>
    </OsShell>
  );
}
