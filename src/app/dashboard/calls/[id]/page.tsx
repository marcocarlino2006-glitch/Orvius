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
  ownerNotifiedAt: string | null;
  createdAt: string;
  business: { id: string; name: string } | null;
  customer: {
    id: string;
    name: string | null;
    phone: string;
    address: string | null;
    interactionCount: number;
  } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
    status: string;
    job: {
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
    } | null;
  } | null;
};

type Situation = {
  actionsTaken: string[];
  needsReview: boolean;
  reviewReasons: string[];
  priorJobs: Array<{
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
  }>;
};

function formatUrgency(value: string | null) {
  if (!value) return "Flexible";
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const callId = params.id;
  const [call, setCall] = useState<CallDetail | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!callId) return;

    fetch(`/api/calls/${callId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Call not found");
        return res.json();
      })
      .then((data) => {
        setCall(data.call);
        setSituation(data.situation ?? null);
      })
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

  const who =
    call.lead?.name ??
    call.customer?.name ??
    call.callerPhone ??
    "Unknown caller";

  return (
    <OsShell
      title={who}
      subtitle={`Call situation · ${new Date(call.createdAt).toLocaleString()}`}
      businessName={call.business?.name ?? "Your shop"}
      actions={
        <div className="flex flex-wrap gap-2">
          {call.callerPhone ? (
            <a href={`tel:${call.callerPhone}`} className="btn btn-void text-sm">
              Call back
            </a>
          ) : null}
          {call.lead ? (
            <Link href={`/dashboard/inbox/${call.lead.id}`} className="btn btn-secondary text-sm">
              Open lead
            </Link>
          ) : null}
        </div>
      }
    >
      <ProSignalBar showInboxLink={false} compact />

      {situation?.needsReview ? (
        <div className="mb-6">
          <ShellAlert tone="error">
            Needs human review — {situation.reviewReasons.join(" · ")}. Take over from the
            lead or call the customer directly.
          </ShellAlert>
        </div>
      ) : null}

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
                address: call.lead.address ?? call.customer?.address ?? undefined,
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

          {call.summary && call.lead ? (
            <div className="mt-6">
              <ShellPanel title="AI summary">
                <p className="font-sans text-sm leading-relaxed text-void">{call.summary}</p>
              </ShellPanel>
            </div>
          ) : null}

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
          <ShellPanel title="What Orvius did">
            {situation?.actionsTaken?.length ? (
              <ul className="call-situation-list font-sans">
                {situation.actionsTaken.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="font-sans text-sm text-ash">No actions recorded yet.</p>
            )}
            {situation?.needsReview ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {call.lead ? (
                  <Link
                    href={`/dashboard/inbox/${call.lead.id}`}
                    className="btn btn-void text-sm"
                  >
                    Take over lead
                  </Link>
                ) : null}
                {call.callerPhone ? (
                  <a href={`tel:${call.callerPhone}`} className="btn btn-secondary text-sm">
                    Human callback
                  </a>
                ) : null}
              </div>
            ) : null}
          </ShellPanel>

          {call.customer ? (
            <ShellPanel title="Customer">
              <Link
                href={`/dashboard/customers/${call.customer.id}`}
                className="customer-timeline-link font-sans"
              >
                {call.customer.name ?? call.customer.phone} →
              </Link>
              <p className="mt-2 font-sans text-sm text-ash">
                {call.customer.interactionCount} touch
                {call.customer.interactionCount === 1 ? "" : "es"}
                {call.customer.address ? ` · ${call.customer.address}` : ""}
              </p>
            </ShellPanel>
          ) : null}

          {call.lead?.job ? (
            <ShellPanel title="Job from this call">
              <Link
                href={`/dashboard/jobs/${call.lead.job.id}`}
                className="customer-timeline-link font-sans"
              >
                {call.lead.job.title} →
              </Link>
              <p className="mt-2 font-sans text-sm text-ash">
                {call.lead.job.status.replace(/_/g, " ")}
                {call.lead.job.scheduledAt
                  ? ` · ${new Date(call.lead.job.scheduledAt).toLocaleString()}`
                  : ""}
              </p>
            </ShellPanel>
          ) : null}

          {situation?.priorJobs?.length ? (
            <ShellPanel title="Previous jobs">
              <ul className="call-situation-list font-sans">
                {situation.priorJobs.map((job) => (
                  <li key={job.id}>
                    <Link href={`/dashboard/jobs/${job.id}`} className="customer-timeline-link">
                      {job.title}
                    </Link>
                    <span className="text-ash">
                      {" "}
                      · {job.status.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </ShellPanel>
          ) : null}
        </div>
      </div>
    </OsShell>
  );
}
