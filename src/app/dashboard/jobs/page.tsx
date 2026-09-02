"use client";

import { JobCard } from "@/components/job-card";
import { ProPageStrip } from "@/components/pro-page-strip";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
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
};

type PipelineStage = {
  id: string;
  label: string;
  hint?: string;
  coming?: boolean;
  match: (job: JobRow) => boolean;
};

const STAGES: PipelineStage[] = [
  {
    id: "booked",
    label: "Booked",
    match: (j) => j.status === "scheduled" || j.status === "confirmed",
  },
  {
    id: "in_progress",
    label: "In progress",
    match: (j) => j.status === "en_route" || j.status === "on_site",
  },
  {
    id: "completed",
    label: "Completed",
    match: (j) => j.status === "completed",
  },
  {
    id: "estimate",
    label: "Estimates",
    hint: "Next — Money ring",
    coming: true,
    match: () => false,
  },
  {
    id: "invoice",
    label: "Invoices",
    hint: "Next — Money ring",
    coming: true,
    match: () => false,
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
      fetch("/api/leads").then(async (res) => (res.ok ? res.json() : { leads: [] })),
    ])
      .then(([jobData, leadData]) => {
        setJobs(jobData.jobs ?? []);
        const leads = (leadData.leads ?? []) as Array<{ status: string }>;
        setNewLeadCount(leads.filter((l) => l.status === "new").length);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage || stage.coming) return [];
    return jobs.filter(stage.match);
  }, [jobs, stageId]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGES) {
      counts[stage.id] = stage.coming ? 0 : jobs.filter(stage.match).length;
    }
    return counts;
  }, [jobs]);

  return (
    <OsShell
      title="Jobs"
      subtitle="Revenue pipeline — first contact through completed work."
      actions={
        <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
          Dispatch
        </Link>
      }
    >
      <PlanUpgradeGate module="jobs">
      <ProPageStrip />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
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
                className={`jobs-pipeline-stage ${stageId === stage.id ? "jobs-pipeline-stage-active" : ""} ${stage.coming ? "jobs-pipeline-stage-coming" : ""}`}
                onClick={() => !stage.coming && setStageId(stage.id)}
                disabled={stage.coming}
                title={stage.hint}
              >
                <span className="jobs-pipeline-label">
                  {stage.label}
                  {stage.coming ? " · soon" : ""}
                </span>
                <span className="jobs-pipeline-count">
                  {stage.coming ? "—" : stageCounts[stage.id]}
                </span>
              </button>
            ))}
          </div>

          {!jobs.length && !newLeadCount ? (
            <ProEmptyState
              title="No jobs booked yet"
              body="Open a lead in the inbox, capture the details, and book the appointment."
              action={
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Go to inbox
                </Link>
              }
            />
          ) : !filtered.length ? (
            <ProEmptyState
              title={`No ${STAGES.find((s) => s.id === stageId)?.label.toLowerCase() ?? "jobs"} right now`}
              body="Switch stages or book from the inbox."
              action={
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Inbox
                </Link>
              }
            />
          ) : (
            <ul className="ring1-lead-grid">
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
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
