"use client";

import { JobTable } from "@/components/job-card";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { jobRowFacts, type JobRowInput } from "@/lib/job-row";
import { formatCents } from "@/lib/money";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { industryTerms } from "@/lib/industry-terms";
import { useBusiness } from "@/lib/use-business";

type JobRow = JobRowInput & {
  id: string;
  title: string;
  address: string | null;
  customer: { name: string | null; phone: string } | null;
  lead: { name: string | null; phone: string | null } | null;
  estimate?: (NonNullable<JobRowInput["estimate"]> & {
    id: string;
    invoice: (NonNullable<NonNullable<JobRowInput["estimate"]>["invoice"]> & { id: string }) | null;
  }) | null;
};

type PipelineStage = {
  id: string;
  label: string;
  hint?: string;
  empty: string;
  match: (job: JobRow) => boolean;
};

const STAGES: PipelineStage[] = [
  {
    id: "booked",
    empty: "Nothing booked right now",
    label: "Booked",
    match: (j) => j.status === "scheduled" || j.status === "confirmed",
  },
  {
    id: "in_progress",
    empty: "Nobody's on a job right now",
    label: "In progress",
    match: (j) => j.status === "en_route" || j.status === "on_site",
  },
  {
    id: "completed",
    empty: "Nothing completed yet",
    label: "Completed",
    match: (j) => j.status === "completed",
  },
  {
    id: "estimate",
    empty: "No estimates waiting",
    label: "Estimates",
    hint: "Drafts waiting for invoice",
    match: (j) => Boolean(j.estimate && !j.estimate.invoice),
  },
  {
    id: "invoice",
    empty: "No invoices out",
    label: "Invoices",
    hint: "Invoices from estimates",
    match: (j) => Boolean(j.estimate?.invoice),
  },
];

export default function JobsPage() {
  const terms = industryTerms(useBusiness().business?.trade);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageId, setStageId] = useState("booked");
  const [timeZone, setTimeZone] = useState<string | undefined>();

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
        setTimeZone(jobData.timezone ?? undefined);
        setNewLeadCount(leadData.counts?.new ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) return [];
    const now = Date.now();
    return jobs
      .filter(stage.match)
      .map((job) => ({ job, facts: jobRowFacts(job, now) }))
      .sort((a, b) => (b.facts.attention?.weight ?? 0) - (a.facts.attention?.weight ?? 0));
  }, [jobs, stageId]);

  const stageValue = useMemo(() => {
    const cents = filtered.reduce((sum, row) => sum + (row.facts.money.cents ?? 0), 0);
    return cents ? formatCents(cents) : null;
  }, [filtered]);

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
      title={terms.Jobs}
      actions={
        <>
          {unassigned > 0 ? (
            <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
              Assign {unassigned}
            </Link>
          ) : null}
          <Link
            href="/dashboard/jobs/new"
            className={`btn text-sm ${unassigned > 0 ? "btn-secondary" : "btn-void"}`}
          >
            New {terms.job}
          </Link>
        </>
      }
    >
      <PlanUpgradeGate module="jobs">

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
              <span className="jobs-pipeline-label">New requests</span>
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
            <ProEmptyState
              title={`No ${terms.jobs} booked yet`}
              body={`Calls Orvius books land here on their own. Took one yourself? Put it on the schedule.`}
              action={
                <Link href="/dashboard/jobs/new" className="btn btn-void text-sm">
                  New {terms.job}
                </Link>
              }
            />
          ) : !filtered.length ? (
            <ProEmptyState
              title={STAGES.find((s) => s.id === stageId)?.empty ?? "Nothing here right now"}
              body="Switch stages, or book one yourself."
              action={
                <Link href="/dashboard/jobs/new" className="btn btn-void text-sm">
                  New {terms.job}
                </Link>
              }
            />
          ) : (
            <>
            <JobTable
              timeZone={timeZone}
              rows={filtered.map(({ job, facts }) => ({
                id: job.id,
                title: job.title,
                status: job.status,
                scheduledAt: job.scheduledAt,
                address: job.address,
                urgency: job.urgency,
                customerName: job.customer?.name ?? job.lead?.name,
                phone: job.customer?.phone ?? job.lead?.phone,
                facts,
              }))}
            />
            <p className="dt-foot">
              {filtered.length} job{filtered.length === 1 ? "" : "s"}
              {stageValue ? ` · ${stageValue} total` : ""}
            </p>
            </>
          )}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
