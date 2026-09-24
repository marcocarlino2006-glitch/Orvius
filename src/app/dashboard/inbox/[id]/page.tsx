"use client";

import { BookJobForm } from "@/components/book-job-form";
import { AssignTechButton } from "@/components/assign-tech-button";
import { LeadStatusActions } from "@/components/lead-status-actions";
import { LeadQualificationForm } from "@/components/lead-qualification-form";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { TranscriptCinema } from "@/components/transcript-cinema";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import Link from "next/link";
import { useParams } from "next/navigation";
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

type Tech = { id: string; name: string };

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [crew, setCrew] = useState<Tech[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualBookingAvailable, setManualBookingAvailable] = useState(false);
  const [showBookedLeadRepair, setShowBookedLeadRepair] = useState(false);

  const loadLead = useCallback(async () => {
    if (!leadId) return;

    try {
      const [data, techData] = await Promise.all([
        fetch(`/api/leads/${leadId}`).then(async (res) => {
        if (!res.ok) throw new Error("Lead not found");
        return res.json();
      }),
        fetch("/api/technicians").then((res) => res.json()),
      ]);
      setLead(data.lead);
      setCrew(
        (techData.technicians ?? []).map((t: Tech) => ({
          id: t.id,
          name: t.name,
        })),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lead not found");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  if (loading) {
    return (
      <OsShell title="Lead" subtitle="Loading…">
        <ShellLoading />
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

  const updateDraft = (values: {
    name: string;
    phone: string;
    serviceType: string;
    urgency: string;
    address: string;
    notes: string;
  }) =>
    setLead((current) => (current ? { ...current, ...values } : current));
  const finishRepair = (booked: boolean) => {
    setManualBookingAvailable(!booked);
    void loadLead();
  };
  return (
    <OsShell
      title={lead.name ?? "Unknown caller"}
      businessName={lead.business?.name ?? undefined}
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
      <div className="ring1-lead-status mb-3">
        <LeadStatusActions
          leadId={lead.id}
          status={lead.status}
          onUpdated={(status) => setLead({ ...lead, status })}
        />
      </div>

      <div className="os-detail-grid">
        <div className="os-detail-primary">
          {!lead.job ? (
            <ShellPanel title="Complete lead" dense>
              <p className="mb-4 font-sans text-sm leading-relaxed text-ash">
                Correct anything the call missed. Saving retries qualification
                and books automatically when the lead is ready.
              </p>
              <LeadQualificationForm
                leadId={lead.id}
                lead={lead}
                onDraftChange={updateDraft}
                onSaved={finishRepair}
              />
            </ShellPanel>
          ) : null}

          {lead.job ? (
            <ShellPanel title="Job on dispatch" dense>
              <p className="font-sans text-sm text-ash">
                {lead.job.title} · {lead.job.status}
                {lead.job.scheduledAt
                  ? ` · ${new Date(lead.job.scheduledAt).toLocaleString()}`
                  : ""}
                {!lead.job.technicianId ? " · needs a tech" : ""}
              </p>
              {!lead.job.technicianId && crew.length ? (
                <div className="mt-4">
                  <AssignTechButton
                    jobId={lead.job.id}
                    technicians={crew}
                    onAssigned={() => void loadLead()}
                  />
                </div>
              ) : null}
              <Link
                href={`/dashboard/jobs/${lead.job.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Open job →
              </Link>
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
                    onSaved={finishRepair}
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
        </div>

        <div className="os-detail-side">
          {!lead.job && !manualBookingAvailable ? (
            <ShellPanel title="Automation" dense>
              <p className="font-sans text-sm leading-relaxed text-ash">
                Complete the missing call details. Orvius will qualify the lead
                and choose the next available appointment automatically.
              </p>
            </ShellPanel>
          ) : !lead.job ? (
            <ShellPanel title="Book this lead" dense>
              <p className="mb-4 font-sans text-sm leading-relaxed text-ash">
                Schedule this lead on your calendar and assign crew on dispatch.
              </p>
              <BookJobForm leadId={lead.id} urgency={lead.urgency} />
            </ShellPanel>
          ) : null}

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

          {lead.notes?.trim() && lead.notes.trim() !== lead.call?.summary?.trim() ? (
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
