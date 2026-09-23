"use client";

import { AiSituationPanel, type AiSituation } from "@/components/ai-situation-panel";
import { CallPlayer } from "@/components/call-player";
import { ClarityFailure, WorkflowTrail } from "@/components/clarity";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellBadge,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { PAGE_CLARITY, buildRecordTrail } from "@/lib/clarity";
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
  successEvaluation: string | null;
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

type Situation = AiSituation & {
  priorJobs: Array<{
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
  }>;
  timeline: Array<{
    id: string;
    type: string;
    at: string;
    title: string;
    summary: string | null;
    status: string | null;
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
        <ShellLoading />
      </OsShell>
    );
  }

  if (error || !call) {
    return (
      <OsShell title="Call" clarity={PAGE_CLARITY.calls}>
        <ClarityFailure
          title="Call not found"
          cause={error ?? "This call record is missing or you do not have access."}
          impact="You cannot review the transcript or jump to the related lead from here."
          recovery="Return to Calls and open another recording, or check Inbox for the related lead."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/calls" className="btn btn-void text-sm">
                ← Calls
              </Link>
              <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
                Inbox
              </Link>
            </div>
          }
        />
      </OsShell>
    );
  }

  const who =
    call.lead?.name ??
    call.customer?.name ??
    call.callerPhone ??
    "Unknown caller";

  const trail = buildRecordTrail({
    callId: call.id,
    customerId: call.customer?.id,
    jobId: call.lead?.job?.id,
    current: "call",
  });

  return (
    <OsShell
      title={who}
      clarity={{
        what: "This call is the source of truth for what the caller said.",
        happening: call.summary
          ? "Transcript and summary are ready to review."
          : "Recording is filed — open the transcript to verify what Orvius heard.",
        next: call.lead
          ? "Open the lead to call back or book the job."
          : "If this should become work, create follow-up from Inbox after the next call.",
        consequence:
          "Correcting or booking from this call updates the real customer record — nothing stays siloed.",
        primaryHref: call.lead ? `/dashboard/inbox/${call.lead.id}` : "/dashboard/inbox",
        primaryLabel: call.lead ? "Open lead" : "Open Inbox",
      }}
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
      <WorkflowTrail links={trail} className="mb-4" />

      {situation?.needsReview ? (
        <div className="mb-6">
          <ShellAlert tone="error">
            Needs human review — {situation.reviewReasons.join(" · ")}. Take over from the
            lead or call the customer directly.
          </ShellAlert>
        </div>
      ) : null}

      <div className="os-detail-grid">
        <div className="os-detail-primary">
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
            <ShellPanel title="Call summary" dense>
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
            <ShellPanel title="AI summary" dense>
              <p className="font-sans text-sm leading-relaxed text-void">{call.summary}</p>
            </ShellPanel>
          ) : null}

          {/*
            Audio above the words. An owner working through the night's calls
            plays first and reads only when the summary is ambiguous, and the
            player used to sit below a full transcript — off the bottom of the
            screen on any call longer than a minute.
          */}
          {call.recordingUrl ? (
            <CallPlayer src={call.recordingUrl} durationSec={call.durationSec} />
          ) : null}

          {call.transcript ? (
            <TranscriptCinema transcript={call.transcript} variant="void" />
          ) : null}
        </div>

        <div className="os-detail-side">
          {situation ? (
            <AiSituationPanel
              situation={situation}
              takeoverPhone={call.callerPhone ?? call.lead?.phone}
            />
          ) : null}

          {call.customer ? (
            <ShellPanel title="Customer" dense>
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
            <ShellPanel title="Job from this call" dense>
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
            <ShellPanel title="Previous jobs" dense>
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

          {situation?.timeline?.length ? (
            <ShellPanel title="Customer timeline" dense>
              <ul className="call-situation-list font-sans">
                {situation.timeline.map((event) => (
                  <li key={`${event.type}-${event.id}`}>
                    <span className="text-ash">{event.type}</span>
                    {" · "}
                    {event.title}
                    {event.summary ? (
                      <span className="text-ash"> — {event.summary}</span>
                    ) : null}
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
