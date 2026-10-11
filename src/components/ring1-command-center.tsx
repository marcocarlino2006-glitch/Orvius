"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CommandSignals } from "@/components/command-signals";
import { ActivationChecklist } from "@/components/activation-checklist";
import { AskBar, PlanCard, TryDemo } from "@/components/command-board";
import { OrviusPulse } from "@/components/orvius-pulse";
import { TestAlertButton } from "@/components/test-alert-button";
import { WorkCard } from "@/components/work-card";
import { buildCommandSignals, groupWorkItems } from "@/lib/command-model";
import type { Handled } from "@/lib/autopilot";
import { useRing1, type Ring1Data } from "@/lib/ring1-context";
import { formatWhen } from "@/lib/when";

const NEEDS_YOU_SHOWN = 8;

/* Shop problems a test alert proves fixed. */
const ALERT_KINDS = new Set<string>(["alert_failed", "alert_setup", "alerts_muted"]);

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function handledLine(h: Handled | undefined) {
  if (!h) return null;
  const parts = [
    h.calls ? `answered ${plural(h.calls, "call")}` : null,
    h.booked ? `booked ${plural(h.booked, "job")}` : null,
    h.assigned ? `assigned ${plural(h.assigned, "technician")}` : null,
    h.confirmations ? `sent ${plural(h.confirmations, "confirmation")}` : null,
    h.escalated ? `flagged ${plural(h.escalated, "call")} for you` : null,
  ].filter(Boolean);
  return parts.length ? `In the last 24 hours Orvius ${parts.join(", ")}.` : "Orvius hasn't had to act in the last 24 hours.";
}

type TodayJob = NonNullable<Ring1Data["dispatchToday"]>["jobs"][number];

const JOB_STATUS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  en_route: "On the way",
  on_site: "On site",
  completed: "Done",
};

function TodaySchedule({ jobs }: { jobs: TodayJob[] }) {
  const byTech = useMemo(() => {
    const groups = new Map<string, TodayJob[]>();
    for (const job of jobs) {
      const key = job.technician?.name ?? "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === "Unassigned" ? -1 : b === "Unassigned" ? 1 : a.localeCompare(b)));
  }, [jobs]);

  if (!jobs.length) return <p className="cmd-empty">Nothing on the schedule today.</p>;
  return (
    <div className="cmd-today">
      {byTech.map(([tech, list]) => (
        <div key={tech} className={`cmd-today-lane${tech === "Unassigned" ? " cmd-today-lane--open" : ""}`}>
          <p className="cmd-today-tech">
            {tech}
            <span>{plural(list.length, "job")}</span>
          </p>
          <ul>
            {list.map((job) => (
              <li key={job.id}>
                <Link href={`/dashboard/jobs/${job.id}`} className="cmd-today-job">
                  <span className="cmd-today-time">{job.scheduledAt ? formatWhen(job.scheduledAt).replace(/^Today,?\s*/i, "") : "No time"}</span>
                  <span className="cmd-today-title">
                    {job.title}
                    <span>{job.customer?.name ?? job.lead?.name ?? "Customer"}</span>
                  </span>
                  <span className={`cmd-today-status cmd-today-status--${job.status}`}>{JOB_STATUS[job.status] ?? job.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Command answers "what needs my attention?". A banner only when something is
 * disconnected or failing, three counts, the one bar that directs Orvius, the
 * action queue (read from Work, so counts match everywhere), and what was done
 * with its result. Records live on their own screens.
 */
export function Ring1CommandCenter({ setup }: { setup?: ReactNode }) {
  const { data, locked, loading, loadError, lastUpdatedAt, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function retry() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const signals = useMemo(
    () => (data?.commandCounts ? buildCommandSignals(data.commandCounts, groupWorkItems(data.attention ?? [])) : null),
    [data?.commandCounts, data?.attention],
  );

  const lockBar = locked?.reason === "paused" ? (
    <div className="cmd-lockbar" role="status">
      <p className="cmd-lockbar-text">
        <strong>Paused for the off-season.</strong> {locked.message}
      </p>
      <Link href="/dashboard/billing" className="ox-btn ox-btn--primary ox-btn--sm">
        Resume
      </Link>
    </div>
  ) : locked ? (
    <div className="cmd-lockbar" role="status">
      <p className="cmd-lockbar-text">
        <strong>
          {locked.reason === "trial_ended"
            ? "Your pilot ended."
            : locked.reason === "canceled"
              ? "Your plan is canceled."
              : locked.reason === "past_due"
                ? "Your last payment failed."
                : "Pick a plan to start."}
        </strong>{" "}
        Everything is here to read. Pay to book, text and dispatch again.
      </p>
      <Link href="/dashboard/billing" className="ox-btn ox-btn--primary ox-btn--sm">
        {locked.reason === "past_due" ? "Update payment" : "Pay with card"}
      </Link>
    </div>
  ) : null;

  if (!data && loadError && !loading) {
    return (
      <section className="cc" aria-label="Command">
        <div className="ox-state ox-state--failure" role="alert">
          <p className="ox-state-title">Command could not load</p>
          <p className="ox-state-copy">{loadError} Your line keeps answering calls while this screen reconnects.</p>
          <button type="button" className="ox-btn ox-btn--primary" disabled={refreshing} onClick={() => void retry()}>
            {refreshing ? "Retrying…" : "Retry"}
          </button>
        </div>
      </section>
    );
  }

  const work = data?.work;
  const approvals = work?.approvals ?? [];
  const items = work?.items ?? [];
  const attached = new Set(items.map((i) => i.approvalId).filter(Boolean));
  const looseApprovals = approvals.filter((a) => a.proposalId && !attached.has(a.proposalId));
  const approvalFor = (id: string | null) => (id ? approvals.find((a) => a.proposalId === id) ?? null : null);
  const shown = showAll ? items : items.slice(0, NEEDS_YOU_SHOWN);
  const brief = data?.personalBrief ?? null;
  const needsYou = work?.needsYou ?? 0;
  const shopIssues = (work?.shopIssues ?? []).filter((issue) => issue.kind !== "billing_action");
  /* The banner is for what is disconnected or failing; smaller setup gaps wait in the rail. */
  const blocking = shopIssues.filter((issue) => issue.severity === "critical" || issue.severity === "high");
  const minor = shopIssues.filter((issue) => issue.severity !== "critical" && issue.severity !== "high");
  const handled = data?.handled;

  const issueList = (list: typeof shopIssues) => (
    <ul>
      {list.map((issue) => (
        <li key={issue.id} className={`cmd-issue cmd-issue--${issue.severity}`}>
          <p className="cmd-issue-title">{issue.title}</p>
          <p className="cmd-issue-detail">{issue.detail}</p>
          <div className="cmd-issue-actions">
            {ALERT_KINDS.has(issue.kind) ? <TestAlertButton onDone={() => void refresh()} /> : null}
            {issue.href ? (
              <Link href={issue.href} className="cmd-issue-action">
                {issue.action} →
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="cmd">
      {lockBar}
      {blocking.length ? (
        <section className="cmd-issues cmd-readiness" role="alert" aria-labelledby="cmd-readiness">
          <h3 id="cmd-readiness" className="cmd-issues-title">
            {blocking.length === 1 ? "Something needs fixing before Orvius can run normally" : `${blocking.length} things need fixing before Orvius can run normally`}
          </h3>
          {issueList(blocking)}
        </section>
      ) : null}

      <header className="cmd-head">
        <p className="cmd-greeting os-own-color">{brief?.greeting ?? "Command"}</p>
        <h2 className="cmd-headline os-own-color" aria-live="polite">
          {!data ? "Reading the shop…" : needsYou ? `${plural(needsYou, "thing")} ${needsYou === 1 ? "needs" : "need"} your attention` : "Nothing needs your attention right now"}
        </h2>
        <p className="cmd-sub os-own-color">
          {data ? handledLine(handled) : null}
          {brief?.detail.map((line) => (
            <span key={line}> {line}</span>
          ))}
        </p>
      </header>

      <CommandSignals signals={signals} loading={loading} />

      <div className="cmd-ask">
        <AskBar onChange={() => void refresh()} below={setup} />
      </div>

      <section className="cc" aria-label="Command">
        <div className="cc-main">
          <section className="cmd-section" aria-labelledby="cmd-needs">
            <div className="cmd-section-head">
              <h3 id="cmd-needs" className="cmd-section-title">
                Action queue <span className="cmd-count">{data ? needsYou : "–"}</span>
              </h3>
              <Link href="/dashboard/work" className="cmd-section-link">
                All open work{work ? ` · ${work.open}` : ""} →
              </Link>
            </div>
            {!data ? (
              <ul className="wc-list" aria-busy>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="wc wc--loading">
                    <span className="skeleton" style={{ width: "40%", height: 12 }} />
                    <span className="skeleton" style={{ width: "70%", height: 16 }} />
                  </li>
                ))}
              </ul>
            ) : items.length || looseApprovals.length ? (
              <ul className="wc-list">
                {looseApprovals.map((a) => (
                  <li key={a.id} className="wc wc--approval">
                    <p className="wc-tags">
                      <span className="wc-tag wc-tag--you">Orvius wants your OK</span>
                    </p>
                    <PlanCard proposal={{ proposalId: a.proposalId!, preview: a.preview ?? a.title }} onDone={() => void refresh()} />
                  </li>
                ))}
                {shown.map((item) => (
                  <WorkCard key={item.key} item={item} approval={approvalFor(item.approvalId)} technicians={data.technicians ?? []} onChange={() => void refresh()} />
                ))}
              </ul>
            ) : (
              <div className="cmd-clear">
                {data.metrics.totalCalls ? (
                  <>
                    <p className="cmd-clear-title">You&apos;re clear.</p>
                    <p className="cmd-clear-copy">Every open request and job is with Orvius, a technician or the customer. Anything that needs a person lands here first.</p>
                  </>
                ) : (
                  <>
                    <p className="cmd-clear-title">Waiting for your first customer call.</p>
                    <p className="cmd-clear-copy">Requests land here the moment Orvius takes one. Anything that needs a person comes first.</p>
                  </>
                )}
              </div>
            )}
            {items.length > NEEDS_YOU_SHOWN ? (
              <button type="button" className="cmd-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${items.length}`}
              </button>
            ) : null}
          </section>

          <section className="cmd-section" aria-labelledby="cmd-handled">
            <div className="cmd-section-head">
              <h3 id="cmd-handled" className="cmd-section-title">
                Recent actions
              </h3>
              <span className="cmd-section-note">Last 24 hours</span>
            </div>
            {handled?.events.length ? (
              <ul className="cmd-feed">
                {handled.events.map((e) => (
                  <li key={e.id}>
                    <span className="cmd-feed-dot" aria-hidden />
                    <span className="cmd-feed-body">
                      {e.jobId || e.leadId ? (
                        <Link href={e.jobId ? `/dashboard/jobs/${e.jobId}` : `/dashboard/inbox/${e.leadId}`} className="cmd-feed-text">
                          {e.summary}
                        </Link>
                      ) : (
                        <span className="cmd-feed-text">{e.summary}</span>
                      )}
                      <span className="cmd-feed-result">
                        {e.result} · {e.by}
                      </span>
                    </span>
                    <time className="cmd-feed-at" dateTime={e.at}>
                      {formatWhen(e.at)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cmd-empty">{data ? "No actions in the last day." : "Reading…"}</p>
            )}
          </section>

          <section className="cmd-section" aria-labelledby="cmd-today">
            <div className="cmd-section-head">
              <h3 id="cmd-today" className="cmd-section-title">
                Today <span className="cmd-count">{data?.dispatchToday?.jobCount ?? "–"}</span>
              </h3>
              <Link href="/dashboard/schedule" className="cmd-section-link">
                Schedule →
              </Link>
            </div>
            {data ? <TodaySchedule jobs={data.dispatchToday?.jobs ?? []} /> : <p className="cmd-empty">Reading the schedule…</p>}
          </section>

          {data && !data.business?.testMode && !data.business?.referenceImplementation ? (
            <section className="cmd-section" aria-label="Left to turn on">
              <ActivationChecklist onlyLeft />
            </section>
          ) : null}
          {data && !data.business?.referenceImplementation && !data.metrics.totalCalls ? <TryDemo empty /> : null}
        </div>

        <aside className="cc-rail" aria-label="The shop">
          <OrviusPulse
            health={data?.health}
            lastUpdatedAt={lastUpdatedAt}
            stale={Boolean(loadError && data)}
            refreshing={refreshing}
            onRetry={() => void retry()}
            billingStatus={data?.business?.billingStatus}
            referenceImplementation={data?.business?.referenceImplementation}
            testMode={data?.business?.testMode}
          />
          {minor.length ? (
            <section className="cmd-issues" aria-labelledby="cmd-issues">
              <h3 id="cmd-issues" className="cmd-issues-title">
                Worth setting up
              </h3>
              {issueList(minor)}
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
