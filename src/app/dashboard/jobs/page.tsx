"use client";

import { ClarityEmpty, ClarityFailure } from "@/components/clarity";
import { JobCard } from "@/components/job-card";
import { ProLead } from "@/components/pro-lead";
import { ProListEnd } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { PAGE_CLARITY } from "@/lib/clarity";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JobRow = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  urgency: string | null;
  customer: { name: string | null; phone: string } | null;
  lead: { name: string | null; phone: string | null } | null;
  technician?: { name: string } | null;
  estimate?: {
    id: string;
    status: string;
    invoice: { id: string; status: string } | null;
  } | null;
};

type PipelineStage = {
  id: string;
  label: string;
  hint?: string;
  match: (job: JobRow) => boolean;
};

const STAGES: PipelineStage[] = [
  {
    id: "booked",
    label: "Booked",
    match: (j) =>
      !j.estimate && (j.status === "scheduled" || j.status === "confirmed"),
  },
  {
    id: "in_progress",
    label: "In progress",
    match: (j) => j.status === "en_route" || j.status === "on_site",
  },
  {
    id: "completed",
    label: "Completed",
    match: (j) => j.status === "completed" && !j.estimate,
  },
  {
    id: "estimate",
    label: "Estimates",
    hint: "Drafts waiting for invoice",
    match: (j) => Boolean(j.estimate && !j.estimate.invoice),
  },
  {
    id: "invoice",
    label: "Invoices",
    hint: "Invoices from estimates",
    match: (j) => Boolean(j.estimate?.invoice),
  },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageId, setStageId] = useState("booked");

  useEffect(() => {
    Promise.all([
      fetch("/api/jobs").then(async (res) => {
        if (!res.ok) throw new Error("Failed to load jobs");
        return res.json();
      }),
      fetch("/api/leads?limit=1").then(async (res) =>
        res.ok ? res.json() : { counts: { new: 0 } },
      ),
    ])
      .then(([jobData, leadData]) => {
        setJobs(jobData.jobs ?? []);
        setNewLeadCount(leadData.counts?.new ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) return [];
    return jobs.filter(stage.match);
  }, [jobs, stageId]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGES) {
      counts[stage.id] = jobs.filter(stage.match).length;
    }
    return counts;
  }, [jobs]);

  /*
    Open work, not total work. A shop that closed four hundred jobs last year
    does not need that number at the top of the board every morning; it needs
    the count still on its plate, and how much of it has nobody driving to it.
  */
  const open = useMemo(
    () => jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled"),
    [jobs],
  );
  const unassigned = useMemo(
    () => open.filter((job) => !job.technician).length,
    [open],
  );

  return (
    <OsShell
      title="Jobs"
      clarity={{
        ...PAGE_CLARITY.jobs,
        happening:
          unassigned > 0
            ? `${open.length} open · ${unassigned} still need a tech.`
            : PAGE_CLARITY.jobs.happening,
        next:
          unassigned > 0
            ? "Assign a technician on Dispatch, or open the next booked job."
            : PAGE_CLARITY.jobs.next,
        primaryHref: unassigned > 0 ? "/dashboard/dispatch" : PAGE_CLARITY.jobs.primaryHref,
        primaryLabel: unassigned > 0 ? `Assign ${unassigned}` : PAGE_CLARITY.jobs.primaryLabel,
      }}
      subtitle="Open work — first contact through completed jobs."
      actions={
        <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
          Dispatch
        </Link>
      }
    >
      <PlanUpgradeGate module="jobs">
      <ProLead
        loading={loading}
        figure={String(open.length)}
        caption={open.length === 1 ? "job still open" : "jobs still open"}
        detail={
          unassigned > 0
            ? `${unassigned} of them have no tech assigned yet.`
            : "Every open job has a tech on it."
        }
        facts={[
          {
            label: newLeadCount === 1 ? "new lead" : "new leads",
            value: newLeadCount,
            live: newLeadCount > 0,
          },
          { label: "completed", value: stageCounts.completed ?? 0 },
        ]}
        action={
          unassigned > 0 ? (
            <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
              Assign {unassigned}
            </Link>
          ) : null
        }
      />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ClarityFailure
                title="Jobs could not load"
                cause={error}
                impact="You cannot assign techs or advance status until this list recovers."
                recovery="Retry now, or open Inbox to book from a waiting lead."
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-void text-sm"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </button>
                    <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
                      Inbox
                    </Link>
                  </div>
                }
              />
            </div>
          ) : null}

          <div className="jobs-pipeline font-sans" role="tablist" aria-label="Job pipeline">
            <Link
              href="/dashboard/inbox"
              className="jobs-pipeline-stage"
              role="tab"
            >
              <span className="jobs-pipeline-label">New leads</span>
              <span className="jobs-pipeline-count">{newLeadCount}</span>
            </Link>
            {STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={stageId === stage.id}
                className={`jobs-pipeline-stage ${stageId === stage.id ? "jobs-pipeline-stage-active" : ""}`}
                onClick={() => setStageId(stage.id)}
                title={stage.hint}
              >
                <span className="jobs-pipeline-label">{stage.label}</span>
                <span className="jobs-pipeline-count">{stageCounts[stage.id]}</span>
              </button>
            ))}
          </div>

          {!jobs.length && !newLeadCount ? (
            <ClarityEmpty
              title="No jobs booked yet"
              body="Open a lead in the inbox, capture the details, and book the appointment."
              next="Go to Inbox and book the newest waiting lead."
              consequence="Booking creates a job you can assign, estimate, and collect on — the money loop starts here."
              action={
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Go to inbox
                </Link>
              }
            />
          ) : !filtered.length ? (
            <ClarityEmpty
              title={
                stageId === "booked"
                  ? "No booked jobs right now"
                  : stageId === "in_progress"
                    ? "No jobs in progress right now"
                    : stageId === "completed"
                      ? "No completed jobs right now"
                      : stageId === "estimate"
                        ? "No estimates right now"
                        : stageId === "invoice"
                          ? "No invoices right now"
                          : `No ${STAGES.find((s) => s.id === stageId)?.label.toLowerCase() ?? "jobs"} right now`
              }
              body="This stage is clear. Switch stages or book from the inbox."
              next="Open Inbox for new leads, or pick another pipeline stage."
              consequence="Keeping stages current keeps crew, estimates, and payments from stalling."
              action={
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Inbox
                </Link>
              }
            />
          ) : (
            <ul className="os-lead-rail">
              {filtered.map((job) => (
                <li key={job.id}>
                  <JobCard
                    id={job.id}
                    title={job.title}
                    status={job.status}
                    scheduledAt={job.scheduledAt}
                    address={job.address}
                    urgency={job.urgency}
                    customerName={job.customer?.name ?? job.lead?.name}
                    phone={job.customer?.phone ?? job.lead?.phone}
                    technicianName={job.technician?.name}
                  />
                </li>
              ))}
            </ul>
          )}
          {jobs.length ? (
            <ProListEnd count={jobs.length} noun="job" />
          ) : null}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
