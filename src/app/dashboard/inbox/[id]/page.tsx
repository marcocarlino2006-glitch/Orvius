"use client";

import { BookRequest } from "@/components/book-request";
import { RecordFetchError, recordFailureFrom } from "@/lib/dashboard-fetch";
import { RecordLoadFailure } from "@/components/record-load-failure";
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
import { displayPhone } from "@/lib/customer";
import { formatWhen, statusWord } from "@/lib/when";
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
  const [failure, setFailure] = useState<ReturnType<typeof recordFailureFrom> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookedLeadRepair, setShowBookedLeadRepair] = useState(false);
  const [workVersion, setWorkVersion] = useState(0);

  const loadLead = useCallback(async () => {
    if (!leadId) return;

    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new RecordFetchError(res.status);
      const data = await res.json();
      setLead(data.lead);
      setFailure(null);
    } catch (err) {
      setFailure(recordFailureFrom("request", err));
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

  if (failure || !lead) {
    return (
      <OsShell title="Request" subtitle={failure?.status === 404 ? "Not on this account" : "Couldn't load"}>
        <RecordLoadFailure
          failure={failure ?? recordFailureFrom("request", null)}
          backHref="/dashboard/inbox"
          backLabel="Inbox"
          onRetry={() => {
            setLoading(true);
            void loadLead();
          }}
        />
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
  const notes = lead.notes?.trim() && lead.notes.trim() !== lead.call?.summary?.trim() ? lead.notes.trim() : null;
  const seconds = lead.call?.durationSec ?? 0;
  const callLength = seconds ? (seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds}s`) : null;
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
                Fix anything the call got wrong. It books itself once the phone
                and the problem are known.
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
            <ShellPanel
              title="The call"
              dense
              action={
                <button
                  type="button"
                  className="ox-btn ox-btn--quiet ox-btn--sm"
                  aria-expanded={showBookedLeadRepair}
                  onClick={() => setShowBookedLeadRepair((open) => !open)}
                >
                  {showBookedLeadRepair ? "Done" : "Edit details"}
                </button>
              }
            >
              {showBookedLeadRepair ? (
                <>
                  <p className="jv-sub mb-3 font-sans">Saving also retries an unsent booking deposit.</p>
                  <LeadQualificationForm leadId={lead.id} lead={lead} onDraftChange={updateDraft} onSaved={refresh} />
                </>
              ) : (
                <dl className="jv-facts font-sans">
                  <div>
                    <dt>Phone</dt>
                    <dd>{lead.phone ? displayPhone(lead.phone) : "Unknown"}</dd>
                  </div>
                  {lead.serviceType ? (
                    <div>
                      <dt>Problem</dt>
                      <dd>{lead.serviceType}</dd>
                    </div>
                  ) : null}
                  {lead.urgency ? (
                    <div>
                      <dt>Urgency</dt>
                      <dd>{statusWord(lead.urgency)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Address</dt>
                    <dd className={lead.address ? undefined : "jv-missing"}>{lead.address ?? "Not given on the call"}</dd>
                  </div>
                  {notes ? (
                    <div>
                      <dt>Notes</dt>
                      <dd className="jv-notes">{notes}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
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
          {!lead.job ? (
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
          ) : null}

          {lead.customer || lead.call ? (
            <ShellPanel title="Customer" dense>
              <p className="jv-who font-sans">{lead.customer?.name ?? lead.name ?? (lead.phone ? displayPhone(lead.phone) : "Unknown caller")}</p>
              <p className="jv-sub font-sans">
                {[
                  lead.customer ? `${lead.customer.interactionCount} interaction${lead.customer.interactionCount === 1 ? "" : "s"}` : null,
                  lead.call ? `called ${formatWhen(lead.call.createdAt)}${callLength ? ` for ${callLength}` : ""}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="jv-links font-sans">
                {lead.customer ? <Link href={`/dashboard/customers/${lead.customer.id}`}>Customer profile →</Link> : null}
                {lead.call ? <Link href={`/dashboard/calls/${lead.call.id}`}>The call →</Link> : null}
              </div>
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
