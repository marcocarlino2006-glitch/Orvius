"use client";

import { BookJobForm } from "@/components/book-job-form";
import { LeadInboxCard } from "@/components/lead-inbox-card";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellPanel } from "@/components/shell-primitives";
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

  return (
    <OsShell
      title={lead.name ?? "Unknown caller"}
      subtitle={`Lead · ${lead.business?.name ?? "Orvius"} · ${lead.source}`}
      actions={
        lead.phone ? (
          <a href={`tel:${lead.phone}`} className="btn btn-primary text-sm">
            Call lead
          </a>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <LeadInboxCard
          id={lead.id}
          name={lead.name ?? "Unknown caller"}
          phone={lead.phone}
          service={lead.serviceType}
          urgency={lead.urgency}
          address={lead.address}
          business={lead.business?.name ?? null}
          channel={lead.source}
          createdAt={lead.createdAt}
          customerId={lead.customer?.id ?? null}
          returning={(lead.customer?.interactionCount ?? 0) > 1}
          linked={false}
        />

        <div className="space-y-6">
          {lead.job ? (
            <ShellPanel title="Job">
              <p className="font-sans text-sm text-ash">
                Booked as {lead.job.title} · {lead.job.status}
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
                Turn this lead into a scheduled job on the calendar.
              </p>
              <BookJobForm leadId={lead.id} urgency={lead.urgency} />
            </ShellPanel>
          )}

          {lead.customer ? (
            <ShellPanel title="Customer record">
              <p className="font-sans text-sm text-ash">
                Linked to customer with {lead.customer.interactionCount} interaction
                {lead.customer.interactionCount === 1 ? "" : "s"}.
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
            <ShellPanel title="Call transcript">
              <div className="mb-4 flex flex-wrap gap-2">
                <ShellBadge tone="live">{lead.call.status}</ShellBadge>
                {lead.call.durationSec ? (
                  <ShellBadge tone="neutral">{lead.call.durationSec}s</ShellBadge>
                ) : null}
              </div>
              {lead.call.summary ? (
                <p className="font-sans text-sm leading-relaxed text-void">
                  {lead.call.summary}
                </p>
              ) : null}
              {lead.call.transcript ? (
                <pre className="mt-4 max-h-80 overflow-auto rounded-md border border-rule bg-fog/40 p-4 font-sans text-xs leading-relaxed whitespace-pre-wrap text-void">
                  {lead.call.transcript}
                </pre>
              ) : null}
              <Link
                href={`/dashboard/calls/${lead.call.id}`}
                className="customer-timeline-link mt-4 inline-block font-sans"
              >
                View call record →
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
    </OsShell>
  );
}
