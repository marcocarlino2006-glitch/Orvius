"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AskBar, CheckCard, DemoPanel, PlanCard, TryDemo } from "@/components/command-board";
import { DeskBoard } from "@/components/desk-board";
import { SupportContact } from "@/components/support-contact";
import { TestAlertButton } from "@/components/test-alert-button";
import { WorkCard } from "@/components/work-card";
import { replyClock, replyPhrase } from "@/lib/call-latency";
import { commandCallActions, commandCallOutcomeLine, commandCallPhone, commandCallSummary, type CommandCall, type CommandCallLink } from "@/lib/command-call";
import { commandNow } from "@/lib/command-now";
import { deskFacts } from "@/lib/desk-status";
import { isLiveCall } from "@/lib/live-call";
import { useRing1 } from "@/lib/ring1-context";
import { personLabel } from "@/lib/spoken-name";
import { formatBeat, formatWhen } from "@/lib/when";

function callerName(name: string | null | undefined, phone: string | null | undefined): string {
  return personLabel(name, phone);
}

function scheduleConflicts(board: { lanes?: Array<{ blocks: Array<{ conflict: string | null }> }> } | null | undefined): string[] {
  if (!board?.lanes) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const lane of board.lanes) {
    for (const block of lane.blocks) {
      const text = block.conflict?.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(text);
    }
  }
  return lines;
}

function CallAction({ link, who, quiet }: { link: CommandCallLink; who: string; quiet?: boolean }) {
  const className = quiet ? "ox-btn ox-btn--quiet ox-btn--sm" : "ox-btn ox-btn--primary ox-btn--sm";
  if (link.href.startsWith("tel:")) {
    return (
      <a href={link.href} className={className} aria-label={`Call back ${who}`}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function DeskCall({
  call,
  live,
  who,
  when,
  reply,
  timezone,
}: {
  call: CommandCall & { createdAt: string };
  live: boolean;
  who: string;
  when: string;
  reply: string | null;
  timezone?: string | null;
}) {
  const summary = commandCallSummary(call.summary);
  const outcome = commandCallOutcomeLine(call, live);
  const bookedAt = outcome === "Booked" && call.job?.scheduledAt ? formatBeat(call.job.scheduledAt, timezone) : "";
  const phone = commandCallPhone(call);
  const facts = [bookedAt ? `${outcome} · ${bookedAt}` : outcome, phone].filter(Boolean);
  const actions = commandCallActions(call, live);
  return (
    <div className="cmd-call">
      <p className="cmd-call-kicker">{live ? "On the line" : "Latest call"}</p>
      <p className="cmd-live-call">
        {live ? <span className="ask-live-dot" aria-hidden /> : null}
        <Link href={`/dashboard/calls/${call.id}`}>{who}</Link>
        <span className="cmd-live-about">{call.serviceType?.trim() || (live ? "On the line" : "Call")}</span>
        <time dateTime={call.createdAt}>{when}</time>
      </p>
      {summary ? <p className="cmd-call-summary">{summary}</p> : live ? null : <p className="cmd-call-summary">Nothing was written down.</p>}
      {summary ? <p className="cmd-call-note">Written by Orvius</p> : null}
      {facts.length ? <p className="cmd-call-meta">{facts.join(" · ")}</p> : null}
      {call.address?.trim() ? <p className="cmd-call-where">{call.address.trim()}</p> : null}
      <div className="cmd-call-actions">
        <CallAction link={actions.primary} who={who} />
        {actions.secondary ? <CallAction link={actions.secondary} who={who} quiet /> : null}
      </div>
      {reply ? <p className="cmd-call-reply">{reply}</p> : null}
    </div>
  );
}

function minutesOnTheLine(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return "Just connected";
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

/* Shop problems a test alert proves fixed. */
const ALERT_KINDS = new Set<string>(["alert_failed", "alert_setup", "alerts_muted"]);

/**
 * Command is the desk: the sentence, the one thing happening, today's crew,
 * the money, what is still open, then the line you talk on.
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
  const liveCall = (data?.recentCalls ?? []).find((call) => isLiveCall(call.status, call.createdAt)) ?? null;
  const shopIssues = (work?.shopIssues ?? []).filter((issue) => issue.kind !== "billing_action" && !issue.resolveId);
  const blocking = shopIssues.filter((issue) => {
    if (!(issue.severity === "critical" || issue.severity === "high")) return false;
    // One caller is the column, not a breakdown. Two at once still stops the page.
    if (liveCall && issue.kind === "concurrent_calls" && issue.id === `concurrent_calls:${liveCall.id}`) return false;
    return true;
  });
  const liveApproval = looseApprovals[0] ?? null;
  const liveItem = items.find((item) => item.needsYou) ?? null;
  const lastDone = data?.handled?.events[0] ?? null;
  const orviusDid = data?.handled?.events.find((event) => event.by === "Orvius") ?? null;
  const facts = data
    ? deskFacts({
        needsYou: work?.needsYou ?? 0,
        approvals: looseApprovals.length,
        handled: data.handled,
      })
    : null;
  const onTheLine = liveCall ? callerName(liveCall.leadName, liveCall.callerPhone) : null;
  const latestCall = (data?.recentCalls ?? []).find((call) => call.id !== liveCall?.id) ?? null;
  const latestWho = latestCall ? callerName(latestCall.leadName, latestCall.callerPhone) : null;
  const sentence = commandNow(data);
  const pictured = Boolean(liveCall || (latestCall && latestWho));
  const picturedReply = !liveCall && latestCall?.replyP50Ms ? latestCall.replyP50Ms : null;
  const earlierReply =
    (data?.recentCalls ?? []).find((call) => call.replyP50Ms && call.id !== liveCall?.id && call.id !== latestCall?.id)?.replyP50Ms ?? null;
  const replyLine = liveCall
    ? "Reply time lands when the call ends."
    : picturedReply
      ? replyPhrase(picturedReply)
      : earlierReply
        ? `Last measured reply, ${replyClock(earlierReply)}`
        : null;
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

      <div className={pictured ? "cmd-now cmd-stage" : "cmd-now"}>
      <header className="cmd-head">
        <h2 className="cmd-headline os-own-color" aria-live="polite">
          {sentence}
        </h2>
        {facts ? (
          <p className="cmd-facts">
            {facts.you ? <Link href="/dashboard/work">{facts.you}</Link> : null}
            {facts.ok ? <span>{facts.ok}</span> : null}
            {facts.orvius ? <span>{facts.orvius}</span> : null}
          </p>
        ) : null}
      </header>

      <section className="cmd-live" aria-label="Now">
        {liveCall && onTheLine ? (
          <DeskCall call={liveCall} live who={onTheLine} when={minutesOnTheLine(liveCall.createdAt)} reply={replyLine} timezone={data?.coverage?.timezone} />
        ) : latestCall && latestWho ? (
          <DeskCall call={latestCall} live={false} who={latestWho} when={formatWhen(latestCall.createdAt)} reply={replyLine} timezone={data?.coverage?.timezone} />
        ) : null}
        {!pictured && liveApproval ? (
          <ul className="wc-list cmd-queue">
            <li className="wc wc--approval wc--now">
              {liveApproval.needsCheck ? (
                <CheckCard proposalId={liveApproval.proposalId!} title={liveApproval.title} detail={liveApproval.detail} done={liveApproval.needsCheck === "done_unrecorded"} onDone={() => void refresh()} />
              ) : (
                <PlanCard proposal={{ proposalId: liveApproval.proposalId!, preview: liveApproval.preview ?? liveApproval.title }} onDone={() => void refresh()} />
              )}
            </li>
          </ul>
        ) : !pictured && liveItem ? (
          <ul className="wc-list cmd-queue">
            <WorkCard key={liveItem.key} item={liveItem} approval={approvalFor(liveItem.approvalId)} technicians={data?.technicians ?? []} onChange={() => void refresh()} variant="now" timezone={data?.coverage?.timezone} />
          </ul>
        ) : !pictured && lastDone ? (
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
        {pictured ? (
          <a className="cmd-day-step ox-btn ox-btn--quiet ox-btn--sm" href="#the-day">
            The day
          </a>
        ) : null}
      </section>
      </div>

      {!pictured && (liveCall || liveApproval || liveItem) && orviusDid ? (
        <p className="cmd-orvius-did">
          <span>Orvius · {orviusDid.result}</span>
          {orviusDid.jobId || orviusDid.leadId ? (
            <Link href={orviusDid.jobId ? `/dashboard/jobs/${orviusDid.jobId}` : `/dashboard/inbox/${orviusDid.leadId}`}>{orviusDid.summary}</Link>
          ) : (
            <span>{orviusDid.summary}</span>
          )}
          <time dateTime={orviusDid.at}>{formatWhen(orviusDid.at)}</time>
        </p>
      ) : null}

      {data ? (
        <div id="the-day" className="cmd-day-board">
        <DeskBoard
          jobs={data.dispatchToday?.jobs ?? []}
          money={data.money}
          items={items}
          asideKey={liveItem?.key ?? null}
          timezone={data.coverage?.timezone}
          tomorrow={data.tomorrow ? { jobCount: data.tomorrow.jobCount, unassigned: data.tomorrow.unassigned } : null}
          conflicts={scheduleConflicts(data.crewBoard)}
          activity={data.handled?.events ?? []}
          activitySkipId={!liveCall && !liveApproval && !liveItem ? (lastDone?.id ?? null) : null}
        />
        </div>
      ) : null}

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
