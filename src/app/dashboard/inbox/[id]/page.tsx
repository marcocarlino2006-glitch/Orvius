"use client";

import { BookJobForm } from "@/components/book-job-form";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import { LeadStatusActions } from "@/components/lead-status-actions";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type LeadDetail = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  source: string;
  createdAt: string;
  business: { id: string; name: string } | null;
  customer: { id: string; name: string | null; phone: string; interactionCount: number } | null;
  call: {
    id: string;
    summary: string | null;
    transcript: string | null;
    durationSec: number | null;
    status: string;
    createdAt: string;
  } | null;
  job: {
    id: string;
    status: string;
    scheduledAt: string | null;
    title: string;
  } | null;
};

function formatUrgency(value: string | null) {
  if (!value) return "Flexible";
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) return;

    fetch(`/api/leads/${leadId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Lead not found");
        return res.json();
      })
      .then((data) => setLead(data.lead))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) {
    return (
      <OsShell title="Lead" subtitle="Loading…">
        <p className="font-sans text-sm text-ash">Loading…</p>
      </OsShell>
    );
  }

  if (error || !lead) {
    return (
      <OsShell title="Lead" subtitle="Not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/inbox" className="customer-timeline-link mt-4 inline-block font-sans">
          ← Inbox
        </Link>
      </OsShell>
    );
  }

  const channel =
    lead.source === "sms"
      ? "SMS inquiry"
      : `Inbound call · ${lead.business?.name ?? "Orvius"}`;

  return (
    <OsShell
      title={lead.name ?? "Unknown caller"}
      subtitle={`${lead.business?.name ?? "Your shop"} · ${lead.source === "sms" ? "Text lead" : "Call lead"}`}
      businessName={lead.business?.name ?? "Summit HVAC"}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {lead.phone ? (
            <>
              <a href={`tel:${lead.phone}`} className="btn btn-void text-sm">
                Call lead
              </a>
              <a href={`sms:${lead.phone}`} className="btn btn-secondary text-sm">
                Text lead
              </a>
            </>
          ) : null}
        </div>
      }
    >
      <ProSignalBar showInboxLink={false} compact />

      <div className="ring1-lead-status mb-6">
        <LeadStatusActions
          leadId={lead.id}
          status={lead.status}
          onUpdated={(status) => setLead({ ...lead, status })}
        />
      </div>

      <div className="ring1-lead-grid ring1-lead-grid-with-bar">
        <div className="ring1-lead-primary">
          <OwnerAlertCard
            variant="void"
            lead={{
              name: lead.name ?? undefined,
              phone: lead.phone ?? undefined,
              service: lead.serviceType ?? undefined,
              urgency: formatUrgency(lead.urgency),
              address: lead.address ?? undefined,
              channel,
            }}
          />

          {lead.call?.transcript ? (
            <TranscriptCinema
              transcript={lead.call.transcript}
              variant="chalk"
              className="mt-6"
            />
          ) : null}
        </div>

        <div className="ring1-lead-side space-y-6">
          {lead.job ? (
            <ShellPanel title="Job booked">
              <p className="font-sans text-sm text-ash">
                {lead.job.title} · {lead.job.status}
                {lead.job.scheduledAt
                  ? ` · ${new Date(lead.job.scheduledAt).toLocaleString()}`
                  : ""}
              </p>
              <Link
                href={`/dashboard/jobs/${lead.job.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Open job →
              </Link>
            </ShellPanel>
          ) : (
            <ShellPanel title="Book this lead">
              <p className="mb-4 font-sans text-sm leading-relaxed text-ash">
                Schedule this lead on your calendar and assign crew on dispatch.
              </p>
              <BookJobForm leadId={lead.id} urgency={lead.urgency} />
            </ShellPanel>
          )}

          {lead.customer ? (
            <ShellPanel title="Customer">
              <p className="font-sans text-sm text-ash">
                {lead.customer.interactionCount} interaction
                {lead.customer.interactionCount === 1 ? "" : "s"} on record.
              </p>
              <Link
                href={`/dashboard/customers/${lead.customer.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Open customer →
              </Link>
            </ShellPanel>
          ) : null}

          {lead.call ? (
            <ShellPanel title="Call record">
              <p className="font-sans text-sm text-ash">
                {lead.call.status}
                {lead.call.durationSec ? ` · ${lead.call.durationSec}s` : ""}
              </p>
              {lead.call.summary ? (
                <p className="mt-3 font-sans text-sm leading-relaxed text-void">
                  {lead.call.summary}
                </p>
              ) : null}
              <Link
                href={`/dashboard/calls/${lead.call.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Full call record →
              </Link>
            </ShellPanel>
          ) : null}

          {lead.notes ? (
            <ShellPanel title="Notes">
              <p className="font-sans text-sm leading-relaxed text-void whitespace-pre-wrap">
                {lead.notes}
              </p>
            </ShellPanel>
          ) : null}
        </div>
      </div>

      {!lead.job ? (
        <div className="lead-detail-sticky font-sans">
          <div className="lead-detail-sticky-inner">
            {lead.phone ? (
              <>
                <a href={`tel:${lead.phone}`} className="lead-detail-sticky-btn">
                  Call back
                </a>
                <a href={`sms:${lead.phone}`} className="lead-detail-sticky-btn lead-detail-sticky-btn-muted">
                  Text
                </a>
              </>
            ) : null}
            <BookJobQuickButton
              leadId={lead.id}
              className="lead-detail-sticky-btn lead-detail-sticky-btn-primary"
              onBooked={() => {
                window.location.reload();
              }}
            />
            <Link href="/dashboard/dispatch" className="lead-detail-sticky-btn lead-detail-sticky-btn-muted">
              Dispatch
            </Link>
          </div>
        </div>
      ) : null}
    </OsShell>
  );
}
