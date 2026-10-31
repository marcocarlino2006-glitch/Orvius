"use client";

import { LoadFailure, SESSION_EXPIRED } from "@/components/load-failure";
import { JobTable } from "@/components/job-card";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { jobsBrief } from "@/lib/list-brief";
import { jobRowFacts, type JobRowInput } from "@/lib/job-row";
import { formatCents } from "@/lib/money";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { industryTerms } from "@/lib/industry-terms";
import { useBusiness } from "@/lib/use-business";
import { JOB_STATE_LABEL, jobLifecycle, type JobState } from "@/lib/job-lifecycle";
import { jobPastDue } from "@/lib/job-status";

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

type Tab = { id: "open" | "late" | JobState; label: string; empty: string };

const TABS: Tab[] = [
  { id: "open", label: "All open", empty: "No open work right now" },
  { id: "late", label: "Late", empty: "Nothing is late" },
  { id: "awaiting_confirmation", label: JOB_STATE_LABEL.awaiting_confirmation, empty: "Nobody is waiting to confirm" },
  { id: "confirmed", label: JOB_STATE_LABEL.confirmed, empty: "Every confirmed job has someone going" },
  { id: "assigned", label: JOB_STATE_LABEL.assigned, empty: "Nothing assigned and waiting" },
  { id: "in_progress", label: JOB_STATE_LABEL.in_progress, empty: "Nobody is on a job right now" },
  { id: "completion_reported", label: JOB_STATE_LABEL.completion_reported, empty: "No finished work waiting on an outcome" },
  { id: "closed", label: JOB_STATE_LABEL.closed, empty: "Nothing closed yet" },
];

const matchesTab = (tab: Tab["id"], state: JobState, job: { status: string; scheduledAt: string | null }) =>
  tab === "late" ? jobPastDue(job) : tab === "open" ? state !== "closed" : state === tab;

function emptyJobs(
  tabId: Tab["id"],
  counts: Record<string, number>,
  query: string,
  jobWord: string,
  newLeads: number,
): { title: string; body: string; go: "new" | "open" | "inbox" } {
  if (query) {
    return { title: `No ${jobWord} match "${query}"`, body: "Try a name, a street, or a phone number.", go: "new" };
  }
  const open = counts.open ?? 0;
  const closed = counts.closed ?? 0;
  if (tabId === "open" && open === 0 && closed > 0) {
    return { title: "No open work right now", body: "Finished jobs are under Closed.", go: "new" };
  }
  if (tabId !== "open" && open > 0) {
    return {
      title: TABS.find((t) => t.id === tabId)?.empty ?? "Nothing here right now",
      body: "Open work is under All open.",
      go: "open",
    };
  }
  if (newLeads > 0) {
    return { title: `No ${jobWord} booked yet`, body: "A call is waiting in the Inbox. Book it, or put one on the schedule yourself.", go: "inbox" };
  }
  return {
    title: `No ${jobWord} booked yet`,
    body: "A call that books lands here. Took one yourself? Put it on the schedule.",
    go: "new",
  };
}

export default function JobsPage() {
  const terms = industryTerms(useBusiness().business?.trade);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabId, setTabId] = useState<Tab["id"]>("open");
  const [query, setQuery] = useState("");
  const [timeZone, setTimeZone] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [closedNext, setClosedNext] = useState<string | null>(null);
  const [closedTotal, setClosedTotal] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [found, setFound] = useState<{ q: string; jobs: JobRow[]; truncated: boolean } | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    setError(null);
    Promise.all([
      fetch("/api/jobs").then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? SESSION_EXPIRED : "Jobs didn't load. Nothing changed; try again.");
        return res.json();
      }),
      fetch("/api/leads?limit=1").then(async (res) =>
        res.ok ? res.json() : { counts: { new: 0 } },
      ),
    ])
      .then(([jobData, leadData]) => {
        setJobs(jobData.jobs ?? []);
        setClosedNext(jobData.closedNext ?? null);
        setClosedTotal(typeof jobData.closedTotal === "number" ? jobData.closedTotal : null);
        setTimeZone(jobData.timezone ?? undefined);
        setNewLeadCount(leadData.counts?.new ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [attempt]);

  const term = query.trim();
  const searching = term.length >= 2;
  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/jobs?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("search"))))
        .then((data) => {
          setSearchFailed(false);
          setFound({ q: term, jobs: data.jobs ?? [], truncated: Boolean(data.truncated) });
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setSearchFailed(true);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searching]);

  async function loadOlderClosed() {
    if (!closedNext || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/jobs?closedBefore=${encodeURIComponent(closedNext)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setJobs((current) => {
        const seen = new Set(current.map((job) => job.id));
        return [...current, ...(data.jobs ?? []).filter((job: JobRow) => !seen.has(job.id))];
      });
      setClosedNext(data.closedNext ?? null);
    } catch {
      setError("Older jobs didn't load. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  const withState = useMemo(() => jobs.map((job) => ({ job, state: jobLifecycle(job).state })), [jobs]);

  /*
    Typing searches the loaded board at once, then every job the shop has ever
    had on the server, so an old closed job is found instead of silently missing.
  */
  const searchRows = useMemo(() => {
    if (!searching) return null;
    const q = term.toLowerCase();
    const byId = new Map<string, JobRow>();
    for (const job of jobs) {
      if ([job.title, job.serviceType, job.address, job.customer?.name, job.customer?.phone, job.lead?.name, job.lead?.phone, job.technician?.name].some((v) => v?.toLowerCase().includes(q))) {
        byId.set(job.id, job);
      }
    }
    if (found && found.q === term) for (const job of found.jobs) byId.set(job.id, job);
    return [...byId.values()].map((job) => ({ job, state: jobLifecycle(job).state }));
  }, [searching, term, jobs, found]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return (searchRows ?? withState)
      .filter(({ job, state }) => matchesTab(tabId, state, job))
      .map(({ job }) => ({ job, facts: jobRowFacts(job, now) }))
      .sort((a, b) => (b.facts.attention?.weight ?? 0) - (a.facts.attention?.weight ?? 0));
  }, [searchRows, withState, tabId]);

  const stageValue = useMemo(() => {
    const cents = filtered.reduce((sum, row) => sum + (row.facts.money.kind === "expected" ? 0 : (row.facts.money.cents ?? 0)), 0);
    return cents ? formatCents(cents) : null;
  }, [filtered]);

  const tabCounts = useMemo(() => {
    const rows = searchRows ?? withState;
    const counts: Record<string, number> = {};
    for (const tab of TABS) counts[tab.id] = rows.filter(({ job, state }) => matchesTab(tab.id, state, job)).length;
    if (!searchRows && closedTotal !== null) counts.closed = Math.max(counts.closed ?? 0, closedTotal);
    return counts;
  }, [searchRows, withState, closedTotal]);

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
  const depth = useMemo(() => {
    const rows = withState.filter(({ state }) => state !== "closed");
    const needsYou = rows.filter(({ job }) => jobRowFacts(job, Date.now()).attention).length;
    const due = rows.reduce((sum, { job }) => {
      const money = jobRowFacts(job, Date.now()).money;
      return sum + (money.kind === "due" || money.kind === "claimed" || money.kind === "unsent" ? (money.cents ?? 0) : 0);
    }, 0);
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone });
    const today = timeZone ? rows.filter(({ job }) => job.scheduledAt && new Date(job.scheduledAt).toLocaleDateString("en-CA", { timeZone }) === todayKey).length : 0;
    return { open: rows.length, needsYou, unassigned, due, today };
  }, [withState, timeZone, unassigned]);
  const grouped = useMemo(() => {
    const yours = filtered.filter(({ job }) => jobRowFacts(job, Date.now()).attention);
    const rest = filtered.filter(({ job }) => !jobRowFacts(job, Date.now()).attention);
    return yours.length && rest.length ? [{ key: "yours", label: `Needs you · ${yours.length}`, rows: yours }, { key: "rest", label: "Everything else", rows: rest }] : [{ key: "all", label: "", rows: filtered }];
  }, [filtered]);
  const empty = emptyJobs(tabId, tabCounts, query, terms.jobs, newLeadCount);

  return (
    <OsShell
      title={terms.Jobs}
      actions={
        <>
          {unassigned > 0 ? (
            <Link href="/dashboard/schedule" className="ox-btn ox-btn--primary ox-btn--sm">
              Assign {unassigned}
            </Link>
          ) : null}
          <Link
            href="/dashboard/jobs/new"
            className={`ox-btn ox-btn--sm ${unassigned > 0 ? "ox-btn--quiet" : "ox-btn--primary"}`}
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
              <LoadFailure
                title="Jobs not updated"
                error={error}
                onRetry={() => {
                  setLoading(true);
                  setAttempt((n) => n + 1);
                }}
              />
            </div>
          ) : null}

          <p className="pg-purpose font-sans">
            {jobsBrief(depth)}
            {newLeadCount ? (
              <>
                {" "}
                <Link href="/dashboard/inbox">
                  {newLeadCount === 1 ? "1 new request is still in Inbox." : `${newLeadCount} new requests are still in Inbox.`}
                </Link>
              </>
            ) : null}
          </p>

          {!loading && jobs.length ? (
            <dl className="jobs-depth font-sans" aria-label="Where the work stands">
              <div>
                <dt>Open</dt>
                <dd>{depth.open}</dd>
              </div>
              <div className={depth.needsYou ? "is-attention" : ""}>
                <dt>Needs you</dt>
                <dd>{depth.needsYou}</dd>
              </div>
              <div className={unassigned ? "is-attention" : ""}>
                <dt>No technician</dt>
                <dd>{unassigned}</dd>
              </div>
              <div>
                <dt>Today</dt>
                <dd>{depth.today}</dd>
              </div>
              <div>
                <dt>To collect</dt>
                <dd>{depth.due ? formatCents(depth.due) : "—"}</dd>
              </div>
            </dl>
          ) : null}

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

          {error && !jobs.length ? null : !filtered.length ? (
            <ProEmptyState
              title={empty.title}
              body={empty.body}
              action={
                empty.go === "open" ? (
                  <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" onClick={() => setTabId("open")}>
                    All open
                  </button>
                ) : empty.go === "inbox" ? (
                  <Link href="/dashboard/inbox" className="ox-btn ox-btn--primary ox-btn--sm">
                    Inbox
                  </Link>
                ) : (
                  <Link href="/dashboard/jobs/new" className="ox-btn ox-btn--primary ox-btn--sm">
                    New {terms.job}
                  </Link>
                )
              }
            />
          ) : (
            <>
            {grouped.map((group) => (
              <section key={group.key} aria-label={group.label || undefined}>
                {group.label ? <h2 className="jobs-group font-sans">{group.label}</h2> : null}
            <JobTable
              timeZone={timeZone}
              rows={group.rows.map(({ job, facts }) => ({
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
              </section>
            ))}
            <p className="dt-foot">
              {filtered.length} job{filtered.length === 1 ? "" : "s"}
              {stageValue ? ` · ${stageValue} on estimates, invoices and recorded totals (average-ticket guesses left out)` : ""}
              {searching && found?.q === term && found.truncated ? " · showing the 100 most recent matches; add a word to narrow it" : ""}
            </p>
            </>
          )}
          {searching && searchFailed ? (
            <p className="dt-foot">Only the jobs on this board were searched; the full search didn&apos;t answer.</p>
          ) : null}
          {!searching && tabId === "closed" && closedNext ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={loadOlderClosed} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Older closed jobs"}
            </button>
          ) : null}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
