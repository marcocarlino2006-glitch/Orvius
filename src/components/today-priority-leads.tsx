"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AssignTechButton,
  type TechOption,
} from "@/components/assign-tech-button";
import { telHref } from "@/lib/demo-line";
import { usePlanAccess } from "@/lib/use-plan-access";

export type PriorityLead = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  job: {
    id: string;
    title: string;
    scheduledAt: string | null;
    status: string;
    technicianId?: string | null;
  } | null;
};

function isEmergency(urgency: string | null) {
  return urgency?.toLowerCase().includes("emergency") ?? false;
}

function formatRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUrgency(urgency: string | null) {
  if (!urgency) return "New lead";
  if (isEmergency(urgency)) return "Emergency";
  return urgency.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function BookJobQuickButton({
  leadId,
  onBooked,
  className = "today-priority-btn today-priority-btn-primary",
}: {
  leadId: string;
  onBooked?: (jobId: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function book(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book job");
      onBooked?.(data.job.id);
      router.refresh();
    } catch {
      /* detail page fallback */
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={book}
    >
      {loading ? "Booking…" : "Book job"}
    </button>
  );
}

type TodayPriorityLeadsProps = {
  leads: PriorityLead[];
  technicians?: TechOption[];
  onUpdate?: () => void;
};

export function TodayPriorityLeads({
  leads,
  technicians = [],
  onUpdate,
}: TodayPriorityLeadsProps) {
  const { access } = usePlanAccess();
  const canJobs = access?.canAccess("jobs") ?? false;
  const canDispatch = access?.canAccess("dispatch") ?? false;

  if (!leads.length) return null;

  return (
    <section className="today-priority" aria-label="Priority leads">
      {leads.map((lead) => {
        const emergency = isEmergency(lead.urgency);
        const who = lead.name ?? lead.phone ?? "Unknown caller";
        const needsAssign = Boolean(lead.job && !lead.job.technicianId);

        return (
          <article
            key={lead.id}
            className={`today-priority-card ${emergency ? "today-priority-card-emergency" : ""}`}
          >
            <div className="today-priority-copy font-sans">
              <p className="today-priority-kicker">
                {emergency ? (
                  <>
                    <span className="live-dot live-dot-flare" aria-hidden />
                    Emergency · {formatRelative(lead.createdAt)}
                  </>
                ) : (
                  <>New lead · {formatRelative(lead.createdAt)}</>
                )}
              </p>
              <h2 className="today-priority-title">{who}</h2>
              <p className="today-priority-meta">
                {[formatUrgency(lead.urgency), lead.serviceType, lead.address]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {canJobs && lead.job ? (
                <p className="today-priority-booked">
                  Job booked
                  {lead.job.scheduledAt
                    ? ` · ${new Date(lead.job.scheduledAt).toLocaleString(undefined, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : ""}
                  {needsAssign ? " · needs a tech" : ""}
                </p>
              ) : null}
            </div>

            <div className="today-priority-actions font-sans">
              {canJobs && lead.job ? (
                <>
                  {needsAssign && canDispatch ? (
                    <AssignTechButton
                      jobId={lead.job.id}
                      technicians={technicians}
                      onAssigned={() => onUpdate?.()}
                    />
                  ) : null}
                  <Link
                    href={`/dashboard/jobs/${lead.job.id}`}
                    className="today-priority-btn today-priority-btn-primary"
                  >
                    Open job
                  </Link>
                  {canDispatch ? (
                    <Link href="/dashboard/dispatch" className="today-priority-btn">
                      Dispatch
                    </Link>
                  ) : null}
                </>
              ) : canJobs ? (
                <>
                  <BookJobQuickButton leadId={lead.id} onBooked={() => onUpdate?.()} />
                  {lead.phone ? (
                    <a href={telHref(lead.phone)} className="today-priority-btn">
                      Call back
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  {lead.phone ? (
                    <a
                      href={telHref(lead.phone)}
                      className="today-priority-btn today-priority-btn-primary"
                    >
                      Call back
                    </a>
                  ) : null}
                </>
              )}
              <Link href={`/dashboard/inbox/${lead.id}`} className="today-priority-btn">
                Open lead
              </Link>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export { BookJobQuickButton };
