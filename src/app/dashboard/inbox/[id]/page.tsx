"use client";

import { BookRequest } from "@/components/book-request";
import { LeadStatusActions } from "@/components/lead-status-actions";
import { LeadQualificationForm } from "@/components/lead-qualification-form";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { OsShell } from "@/components/os-shell";
import { WorkPanel } from "@/components/work-panel";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
    technicianId: string | null;
  } | null;
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookedLeadRepair, setShowBookedLeadRepair] = useState(false);
  const [workVersion, setWorkVersion] = useState(0);

  const loadLead = useCallback(async () => {
    if (!leadId) return;

    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error("Request not found");
      const data = await res.json();
      setLead(data.lead);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request not found");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  if (loading) {
    return (
      <OsShell title="Request" subtitle="Loading…">
        <ShellLoading />
      </OsShell>
    );
  }

  if (error || !lead) {
    return (
      <OsShell title="Request" subtitle="Not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/work" className="customer-timeline-link mt-4 inline-block font-sans">
          ← Work
        </Link>
      </OsShell>
    );
  }

  const updateDraft = (values: {
    name: string;
    phone: string;
    serviceType: string;
    urgency: string;
    address: string;
    notes: string;
  }) =>
    setLead((current) => (current ? { ...current, ...values } : current));
  const refresh = () => {
    setWorkVersion((v) => v + 1);
    void loadLead();
  };
  const booked = (jobId: string) => router.push(`/dashboard/jobs/${jobId}`);
  return (
    <OsShell
      title={lead.name ?? "Unknown caller"}
      subtitle={[lead.serviceType, lead.address].filter(Boolean).join(" · ") || "Request"}
      businessName={lead.business?.name ?? undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {lead.phone ? (
            <>
              <a href={`tel:${lead.phone}`} className="ox-btn ox-btn--quiet ox-btn--sm">
                Call
              </a>
              <a href={`sms:${lead.phone}`} className="ox-btn ox-btn--quiet ox-btn--sm">
                Text
              </a>
            </>
          ) : null}
          {!lead.job ? <BookRequest leadId={lead.id} onBooked={booked} className="book-request--head" /> : null}
        </div>
      }
    >
      <div className="os-detail-grid">
        <div className="os-detail-primary">
          <WorkPanel kind="request" id={lead.id} onChange={() => void loadLead()} refreshKey={workVersion}>
          {!lead.job ? (
            <ShellPanel title="What the call captured" dense>
              <p className="mb-4 font-sans text-sm leading-relaxed text-ash">
                Fix anything the call missed. Saving books it automatically once
                the phone and the job are known.
              </p>
              <LeadQualificationForm
                leadId={lead.id}
                lead={lead}
                onDraftChange={updateDraft}
                onSaved={refresh}
              />
            </ShellPanel>
          ) : null}

          {lead.job ? (
            <ShellPanel title="Captured details" dense>
              <p className="font-sans text-sm leading-relaxed text-ash">
                Fix anything the call missed. Saving also retries an unsent
                booking deposit when payments are enabled.
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-4 text-sm"
                aria-expanded={showBookedLeadRepair}
                onClick={() => setShowBookedLeadRepair((open) => !open)}
              >
                {showBookedLeadRepair ? "Close details" : "Correct call details"}
              </button>
              {showBookedLeadRepair ? (
                <div className="mt-4">
                  <LeadQualificationForm
                    leadId={lead.id}
                    lead={lead}
                    onDraftChange={updateDraft}
                    onSaved={refresh}
                  />
                </div>
              ) : null}
            </ShellPanel>
          ) : null}

          {lead.call?.transcript ? (
            <TranscriptCinema
              transcript={lead.call.transcript}
              variant="void"
              className="mt-3"
            />
          ) : null}
          </WorkPanel>
        </div>

        <div className="os-detail-side">
          <ShellPanel title="Status" dense>
            <LeadStatusActions
              leadId={lead.id}
              status={lead.status}
              compact
              onUpdated={(status) => {
                setLead({ ...lead, status });
                setWorkVersion((v) => v + 1);
              }}
            />
          </ShellPanel>

          {lead.customer ? (
            <ShellPanel title="Customer" dense>
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
            <ShellPanel title="Call record" dense>
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

          {lead.job && !showBookedLeadRepair && lead.notes?.trim() && lead.notes.trim() !== lead.call?.summary?.trim() ? (
            <ShellPanel title="Notes" dense>
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
            <BookRequest leadId={lead.id} onBooked={booked} className="book-request--sticky" />
          </div>
        </div>
      ) : null}
    </OsShell>
  );
}
