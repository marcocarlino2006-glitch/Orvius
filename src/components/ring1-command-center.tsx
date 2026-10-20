"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AskBar, CheckCard, DemoPanel, PlanCard, TryDemo } from "@/components/command-board";
import { SupportContact } from "@/components/support-contact";
import { TestAlertButton } from "@/components/test-alert-button";
import { WorkCard } from "@/components/work-card";
import { commandSentence } from "@/lib/command-sentence";
import { useRing1 } from "@/lib/ring1-context";
import { formatWhen } from "@/lib/when";

/* Shop problems a test alert proves fixed. */
const ALERT_KINDS = new Set<string>(["alert_failed", "alert_setup", "alerts_muted"]);

/**
 * Command is one column: the sentence, the one thing happening, then the
 * line you talk on. The queue lives on Work, the day on Schedule, the
 * record of calls on Calls. A fourth block on this screen means it became
 * a dashboard again.
 */
export function Ring1CommandCenter({ setup }: { setup?: ReactNode }) {
  const { data, locked, loading, loadError, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);

  async function retry() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

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
      <div className="cmd-lockbar-way-out">
        <a href="/api/account/export" download>
          Download my data
        </a>
        <SupportContact lead="Questions?" subject="Account locked" path="/dashboard" className="cmd-lockbar-support" />
      </div>
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
          <p className="ox-state-copy">{loadError} This screen failing doesn&apos;t stop your line — calls are answered separately.</p>
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
  const brief = data?.personalBrief ?? null;
  const needsYou = work?.needsYou ?? 0;
  const shopIssues = (work?.shopIssues ?? []).filter((issue) => issue.kind !== "billing_action" && !issue.resolveId);
  const blocking = shopIssues.filter((issue) => issue.severity === "critical" || issue.severity === "high");
  const liveApproval = looseApprovals[0] ?? null;
  const liveItem = items[0] ?? null;
  const lastDone = data?.handled?.events[0] ?? null;
  const sentence = commandSentence({
    loaded: Boolean(data),
    brief: brief?.headline ?? null,
    approval: liveApproval ? { title: liveApproval.preview ?? liveApproval.title, needsCheck: Boolean(liveApproval.needsCheck) } : null,
    item: liveItem
      ? { title: liveItem.title, customer: liveItem.customer, nextAction: liveItem.nextAction }
      : null,
    lastSummary: !liveApproval && !liveItem ? (lastDone?.summary ?? null) : null,
  });
  const stale = Boolean(loadError && data);

  return (
    <div className="cmd cmd-one">
      {lockBar}
      {stale ? (
        <p className="cmd-stale" role="status">
          <span>Live refresh paused. This is the last update that loaded.</span>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={refreshing} onClick={() => void retry()}>
            {refreshing ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : null}
      {blocking.length ? (
        <section className="cmd-issues cmd-readiness" role="alert" aria-labelledby="cmd-readiness">
          <h3 id="cmd-readiness" className="cmd-issues-title">
            {blocking.length === 1 ? "Something needs fixing before Orvius can run normally" : `${blocking.length} things need fixing before Orvius can run normally`}
          </h3>
          <ul>
            {blocking.map((issue) => (
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
        </section>
      ) : null}

      <header className="cmd-head">
        <h2 className="cmd-headline os-own-color" aria-live="polite">
          {sentence}
        </h2>
      </header>

      <section className="cmd-live" aria-label="Now">
        {liveApproval ? (
          <ul className="wc-list cmd-queue">
            <li className="wc wc--approval">
              <p className="wc-tags">
                <span className="wc-tag wc-tag--you">{liveApproval.needsCheck ? "Needs a check" : "Orvius wants your OK"}</span>
              </p>
              {liveApproval.needsCheck ? (
                <CheckCard proposalId={liveApproval.proposalId!} title={liveApproval.title} detail={liveApproval.detail} done={liveApproval.needsCheck === "done_unrecorded"} onDone={() => void refresh()} />
              ) : (
                <PlanCard proposal={{ proposalId: liveApproval.proposalId!, preview: liveApproval.preview ?? liveApproval.title }} onDone={() => void refresh()} />
              )}
            </li>
          </ul>
        ) : liveItem ? (
          <ul className="wc-list cmd-queue">
            <WorkCard key={liveItem.key} item={liveItem} approval={approvalFor(liveItem.approvalId)} technicians={data?.technicians ?? []} onChange={() => void refresh()} variant="now" />
          </ul>
        ) : lastDone ? (
          <p className="cmd-live-trace">
            <span className="cmd-feed-dot" aria-hidden />
            {lastDone.jobId || lastDone.leadId ? (
              <Link href={lastDone.jobId ? `/dashboard/jobs/${lastDone.jobId}` : `/dashboard/inbox/${lastDone.leadId}`}>{lastDone.summary}</Link>
            ) : (
              <span>{lastDone.summary}</span>
            )}
            <time dateTime={lastDone.at}>{formatWhen(lastDone.at)}</time>
          </p>
        ) : null}
        {needsYou > 1 ? (
          <p className="cmd-rest">
            <Link href="/dashboard/work">The rest is in Work</Link>
          </p>
        ) : null}
      </section>

      <div className="cmd-ask">
        <AskBar onChange={() => void refresh()} below={setup} />
        {data?.business?.demoWorkspace ? <DemoPanel onChange={() => void refresh()} /> : null}
        {data && !data.business?.demoWorkspace && !data.business?.referenceImplementation ? (
          <TryDemo empty={!data.metrics.totalCalls} />
        ) : null}
      </div>
    </div>
  );
}
