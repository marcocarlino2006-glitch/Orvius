"use client";

import { CallPlayer } from "@/components/call-player";
import { CorrectReceptionist } from "@/components/correct-receptionist";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import type { CallGrade } from "@/lib/call-quality";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { displayPhone } from "@/lib/customer";
import { jobStatusTitle } from "@/lib/job-status";
import { formatDay, formatWhen, statusWord } from "@/lib/when";

type CallDetail = {
  id: string;
  callerPhone: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  contentPurgedAt: string | null;
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

type Situation = {
  actionsTaken: string[];
  quality: CallGrade;
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
  return value ? statusWord(value) : undefined;
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

  const phone = call.lead?.phone ?? call.callerPhone;
  const address = call.lead?.address ?? call.customer?.address ?? null;
  const service = call.lead?.serviceType ?? null;
  /* The summary is often just "Name: service", which the facts already say. */
  const summary = call.summary && !(service && call.summary.toLowerCase().includes(service.toLowerCase())) ? call.summary : null;
  const length = call.durationSec ? (call.durationSec >= 60 ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, "0")}` : `${call.durationSec}s`) : null;
  const quality = situation?.quality ?? null;

  return (
    <OsShell
      title={who}
      subtitle={[service, formatWhen(call.createdAt)].filter(Boolean).join(" · ")}
      businessName={call.business?.name ?? "Your shop"}
      actions={
        <div className="flex flex-wrap gap-2">
          {call.callerPhone ? (
            <a href={`tel:${call.callerPhone}`} className="ox-btn ox-btn--primary ox-btn--sm">
              Call back
            </a>
          ) : null}
          {call.lead ? (
            <Link href={`/dashboard/inbox/${call.lead.id}`} className="ox-btn ox-btn--quiet ox-btn--sm">
              Open request
            </Link>
          ) : null}
        </div>
      }
    >
      {quality?.verdict === "fix" ? (
        <div className="mb-6">
          <ShellAlert tone="error">{quality.headline} Call the customer to make it right.</ShellAlert>
        </div>
      ) : null}

      <div className="os-detail-grid cl-grid">
        <div className="os-detail-primary">
          <ShellPanel title="The call" dense>
            {summary ? <p className="jv-lede font-sans">{summary}</p> : null}
            <dl className="jv-facts font-sans">
              <div>
                <dt>Phone</dt>
                <dd>{phone ? displayPhone(phone) : "Unknown"}</dd>
              </div>
              {service ? (
                <div>
                  <dt>Problem</dt>
                  <dd>{service}</dd>
                </div>
              ) : null}
              {call.lead?.urgency ? (
                <div>
                  <dt>Urgency</dt>
                  <dd>{formatUrgency(call.lead.urgency)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Address</dt>
                <dd className={address ? undefined : "jv-missing"}>{address ?? "Not given on the call"}</dd>
              </div>
              {length ? (
                <div>
                  <dt>Length</dt>
                  <dd>{length}</dd>
                </div>
              ) : null}
            </dl>
          </ShellPanel>

          {/*
            Audio above the words. An owner working through the night's calls
            plays first and reads only when the summary is ambiguous.
          */}
          {call.recordingUrl ? (
            <CallPlayer src={`/api/calls/${callId}/recording`} durationSec={call.durationSec} />
          ) : null}

          {call.transcript ? (
            <TranscriptCinema transcript={call.transcript} variant="void" />
          ) : null}

          {call.contentPurgedAt ? (
            <p className="font-sans text-sm leading-relaxed text-void">
              The recording and transcript were deleted 24 months after the call. The summary and job history stay.
            </p>
          ) : null}
        </div>

        <div className="os-detail-side">
          <ShellPanel title="What happened" dense>
            {call.lead?.job ? (
              <Link href={`/dashboard/jobs/${call.lead.job.id}`} className="cl-outcome cl-outcome--ok font-sans">
                <span className="cl-outcome-label">Booked</span>
                <span className="cl-outcome-title">{call.lead.job.title}</span>
                <span className="jv-sub">
                  {[jobStatusTitle(call.lead.job.status), call.lead.job.scheduledAt ? formatWhen(call.lead.job.scheduledAt) : null].filter(Boolean).join(" · ")}
                </span>
              </Link>
            ) : call.lead ? (
              <Link href={`/dashboard/inbox/${call.lead.id}`} className="cl-outcome font-sans">
                <span className="cl-outcome-label">Not booked yet</span>
                <span className="cl-outcome-title">Open the request</span>
              </Link>
            ) : (
              <p className="jv-sub font-sans">{call.status === "ended" ? "Answered. Nothing to book." : statusWord(call.status)}</p>
            )}
            {situation?.actionsTaken?.length ? (
              <p className="jv-sub cl-did font-sans">Orvius: {situation.actionsTaken.join(" · ").toLowerCase()}</p>
            ) : null}
            {call.customer ? (
              <div className="jv-links font-sans">
                <Link href={`/dashboard/customers/${call.customer.id}`}>
                  {call.customer.name ? `${call.customer.name}'s profile` : "Customer profile"} →
                </Link>
              </div>
            ) : null}
            {situation?.priorJobs?.length ? (
              <div className="cl-prior font-sans">
                <p className="jf-label">Before this call</p>
                <ul>
                  {situation.priorJobs.map((job) => (
                    <li key={job.id}>
                      <Link href={`/dashboard/jobs/${job.id}`}>{job.title}</Link>
                      <span className="jv-sub">
                        {[job.scheduledAt ? formatDay(job.scheduledAt) : null, jobStatusTitle(job.status)].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ShellPanel>

          {quality ? (
            <div className="call-quality-panel">
              <ShellPanel title="Call review" dense action={<span className={`cl-score cl-score--${quality.verdict}`}>{quality.score}/100</span>}>
                <p className="font-sans text-sm leading-relaxed text-void">
                  {quality.findings.length > 1 ? `${quality.findings.length} things worth a listen:` : quality.headline}
                </p>
                {quality.findings.length > 1 ? (
                  <ul className="font-sans">
                    {quality.findings.map((finding) => (
                      <li key={finding.key} className={finding.severity === "fix" ? "is-fix" : ""}>
                        {finding.label}
                        {finding.quote ? <q>{finding.quote}</q> : null}
                      </li>
                    ))}
                  </ul>
                ) : quality.findings[0]?.quote ? (
                  <ul className="font-sans">
                    <li>
                      <q>{quality.findings[0].quote}</q>
                    </li>
                  </ul>
                ) : null}
                <div className="mt-3">
                  <CorrectReceptionist callId={call.id} />
                </div>
              </ShellPanel>
            </div>
          ) : (
            <ShellPanel title="Call review" dense>
              <CorrectReceptionist callId={call.id} />
            </ShellPanel>
          )}
        </div>
      </div>
    </OsShell>
  );
}
