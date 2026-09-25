"use client";

import { RecordLink } from "@/components/record-drawer";
import { BookJobQuickButton } from "@/components/today-priority-leads";
import { leadNextAction } from "@/lib/lead-next-action";

type LeadQuickActionsProps = {
  leadId: string;
  phone: string | null;
  status: string;
  urgency: string | null;
  address: string | null;
  jobId: string | null;
  onBooked?: (jobId: string) => void;
};

/** One primary action per opportunity; text, contacted and the rest live in the drawer. */
export function LeadQuickActions({ leadId, phone, status, urgency, address, jobId, onBooked }: LeadQuickActionsProps) {
  const next = leadNextAction({ status, urgency, phone, address, jobId });

  return (
    <div className="lead-quick-actions font-sans" onClick={(e) => e.stopPropagation()}>
      {next.kind === "view_job" ? (
        <RecordLink type="job" id={next.jobId} href={`/dashboard/jobs/${next.jobId}`} className="lead-quick-btn">
          {next.label}
        </RecordLink>
      ) : next.kind === "call" ? (
        <a href={`tel:${next.phone}`} className="lead-quick-btn lead-quick-btn-primary">
          {next.label}
        </a>
      ) : next.kind === "book" ? (
        <BookJobQuickButton leadId={leadId} onBooked={onBooked} className="lead-quick-btn lead-quick-btn-primary" />
      ) : (
        <RecordLink type="lead" id={leadId} href={`/dashboard/inbox/${leadId}`} className="lead-quick-btn">
          {next.label}
        </RecordLink>
      )}
    </div>
  );
}
