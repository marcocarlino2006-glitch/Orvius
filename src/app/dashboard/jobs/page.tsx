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
import { JOB_STATE_LABEL, jobLifecycle, type JobState } from "@/lib/job-lifecycle";

type JobRow = JobRowInput & {
  id: string;
  title: string;
  address: string | null;
  serviceType?: string | null;
  durationMin?: number | null;
  outcomeCapturedAt?: string | null;
  resolutionCode?: string | null;
  customer: { name: string | null; phone: string } | null;
  lead: { name: string | null; phone: string | null } | null;
  estimate?: (NonNullable<JobRowInput["estimate"]> & {
    id: string;
    invoice: (NonNullable<NonNullable<JobRowInput["estimate"]>["invoice"]> & { id: string }) | null;
  }) | null;
};

type Tab = { id: "open" | JobState; label: string; empty: string };

const TABS: Tab[] = [
  { id: "open", label: "All open", empty: "No open work right now" },
  { id: "awaiting_confirmation", label: JOB_STATE_LABEL.awaiting_confirmation, empty: "Nobody is waiting to confirm" },
  { id: "confirmed", label: JOB_STATE_LABEL.confirmed, empty: "Every confirmed job has someone going" },
  { id: "assigned", label: JOB_STATE_LABEL.assigned, empty: "Nothing assigned and waiting" },
  { id: "in_progress", label: JOB_STATE_LABEL.in_progress, empty: "Nobody is on a job right now" },
  { id: "completion_reported", label: JOB_STATE_LABEL.completion_reported, empty: "No finished work waiting on an outcome" },
  { id: "closed", label: JOB_STATE_LABEL.closed, empty: "Nothing closed yet" },
];

const matchesTab = (tab: Tab["id"], state: JobState) =>
  tab === "open" ? state !== "closed" : state === tab;

export default function JobsPage() {
  const terms = industryTerms(useBusiness().business?.trade);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabId, setTabId] = useState<Tab["id"]>("open");
  const [query, setQuery] = useState("");
  const [timeZone, setTimeZone] = useState<string | undefined>();

  useEffect(() => {
    Promise.all([
      fetch("/api/jobs").then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "Jobs didn't load. Nothing changed; try again.");
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

  const withState = useMemo(() => jobs.map((job) => ({ job, state: jobLifecycle(job).state })), [jobs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return withState
      .filter(({ state }) => matchesTab(tabId, state))
      .filter(({ job }) =>
        !q ||
        [job.title, job.serviceType, job.address, job.customer?.name, job.customer?.phone, job.lead?.name, job.lead?.phone, job.technician?.name]
          .some((v) => v?.toLowerCase().includes(q)),
      )
      .map(({ job }) => ({ job, facts: jobRowFacts(job, now) }))
      .sort((a, b) => (b.facts.attention?.weight ?? 0) - (a.facts.attention?.weight ?? 0));
  }, [withState, tabId, query]);

  const stageValue = useMemo(() => {
    const cents = filtered.reduce((sum, row) => sum + (row.facts.money.kind === "expected" ? 0 : (row.facts.money.cents ?? 0)), 0);
    return cents ? formatCents(cents) : null;
  }, [filtered]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) counts[tab.id] = withState.filter(({ state }) => matchesTab(tab.id, state)).length;
    return counts;
  }, [withState]);

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
            <Link href="/dashboard/schedule" className="btn btn-void text-sm">
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

          <p className="pg-purpose font-sans">
            What you&apos;re committed to doing. Requests that haven&apos;t been booked yet stay in{" "}
            <Link href="/dashboard/inbox">Inbox{newLeadCount ? ` (${newLeadCount} new)` : ""}</Link>.
          </p>

          <div className="jobs-pipeline font-sans" role="tablist" aria-label="Job status">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tabId === tab.id}
                className={`jobs-pipeline-stage ${tabId === tab.id ? "jobs-pipeline-stage-active" : ""}`}
                onClick={() => setTabId(tab.id)}
              >
                <span className="jobs-pipeline-label">{tab.label}</span>
                <span className="jobs-pipeline-count">{tabCounts[tab.id]}</span>
              </button>
            ))}
          </div>

          {jobs.length ? (
            <input
              type="search"
              className="input pg-search font-sans"
              placeholder="Search by customer, address, work or technician"
              aria-label="Search jobs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}

          {error && !jobs.length ? null : !jobs.length ? (
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
              title={query ? `No ${terms.jobs} match "${query}"` : (TABS.find((t) => t.id === tabId)?.empty ?? "Nothing here right now")}
              body={query ? "Try a name, a street, or a phone number." : "Pick another status, or book one yourself."}
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
                workType: job.serviceType,
                durationMin: job.durationMin,
                lifecycle: job,
                customerName: job.customer?.name ?? job.lead?.name,
                phone: job.customer?.phone ?? job.lead?.phone,
                facts,
              }))}
            />
            <p className="dt-foot">
              {filtered.length} job{filtered.length === 1 ? "" : "s"}
              {stageValue ? ` · ${stageValue} on estimates, invoices and recorded totals (average-ticket guesses left out)` : ""}
            </p>
            </>
          )}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
