"use client";

import Link from "next/link";
import { useState } from "react";
import { lanesForToday, openGroups, type CommandMoney, type DeskItem, type DeskJob } from "@/lib/command-depth";
import { moneyBrief } from "@/lib/desk-status";
import { personLabel, spokenText } from "@/lib/spoken-name";
import { formatWhen } from "@/lib/when";

/** Rows on the first view. The rest stay grouped behind one control. */
const FIRST_ROWS = 6;
const PER_GROUP = 2;

type TodayJob = DeskJob & {
  title: string;
  status: string;
  scheduledAt: string | null;
  customer?: { name: string | null; phone?: string | null } | null;
  lead?: { name: string | null; phone?: string | null } | null;
};

type OpenItem = DeskItem & {
  href: string;
  title: string;
  customer: string | null;
  phone?: string | null;
  amountLabel: string | null;
  nextAction?: string | null;
  needsYou?: boolean;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt?: string;
};

type ActivityEvent = {
  id: string;
  at: string;
  summary: string;
  jobId: string | null;
  leadId: string | null;
  result: string;
  by: string;
};

const STATUS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  en_route: "On the way",
  on_site: "On site",
  completed: "Done",
};

function clock(value: string | null, timezone?: string | null): string {
  if (!value) return "No time";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "No time";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(at);
}

function rank(items: OpenItem[]): OpenItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.needsYou) - Number(a.item.needsYou) || a.index - b.index)
    .map(({ item }) => item);
}

function openSummary(count: number, waitingOnYou: number): string {
  if (waitingOnYou <= 0) {
    return count === 1 ? "1 item is still open. It is not waiting on you." : `${count} items are still open. None of them are waiting on you.`;
  }
  if (waitingOnYou === count) {
    return count === 1 ? "1 item is waiting on you." : `${count} items are still open, and each one is waiting on you.`;
  }
  const you = waitingOnYou === 1 ? "1 is waiting on you." : `${waitingOnYou} are waiting on you.`;
  const open = count === 1 ? "1 item is still open." : `${count} items are still open.`;
  return `${open} ${you} Those come first.`;
}

function Money({
  money,
  week,
}: {
  money: CommandMoney;
  week?: { jobsBooked: number; avgTicketCents: number | null; closed?: string | null };
}) {
  const brief = moneyBrief(money, week);
  return (
    <section className="cmd-section" aria-labelledby="desk-money">
      <h3 id="desk-money" className="cmd-section-title">
        <Link href="/dashboard/reports">Money</Link>
      </h3>
      <p className="cmd-money-brief">{brief.summary}</p>
      {brief.owed ? (
        <p className="cmd-money-attention">
          {brief.owed} <Link href="/dashboard/reports">Open the report</Link>
        </p>
      ) : null}
      {brief.unbilled ? (
        <p className="cmd-money-attention">
          {brief.unbilled} <Link href="/dashboard/jobs">Open the jobs</Link>
        </p>
      ) : null}
    </section>
  );
}

function OpenWork({
  groups,
  timezone,
}: {
  groups: Array<{ stage: string; label: string; items: OpenItem[] }>;
  timezone?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const ranked = groups.map((group) => ({ ...group, items: rank(group.items) }));
  const openCount = ranked.reduce((sum, group) => sum + group.items.length, 0);
  const waitingOnYou = ranked.reduce((sum, group) => sum + group.items.filter((item) => item.needsYou).length, 0);
  let budget = showAll ? Number.POSITIVE_INFINITY : FIRST_ROWS;
  const blocks = ranked.map((group) => {
    const take = showAll ? group.items.length : Math.min(PER_GROUP, group.items.length, Math.max(0, budget));
    budget -= take;
    return { ...group, take };
  });
  const shown = blocks.reduce((sum, group) => sum + group.take, 0);
  const hidden = openCount - shown;

  return (
    <section className="cmd-section cmd-open" aria-labelledby="desk-open">
      <div className="cmd-section-head">
        <h3 id="desk-open" className="cmd-section-title">
          Open work
        </h3>
        <Link href="/dashboard/work" className="cmd-section-link">
          Work
        </Link>
      </div>
      <p className="cmd-open-summary">{openSummary(openCount, waitingOnYou)}</p>
      {blocks.map((group) => (
        <div key={group.stage} className="cmd-open-group">
          <h4 className="cmd-open-label">
            {group.label}
            <span className="cmd-count">{group.items.length}</span>
          </h4>
          {group.take ? (
            <ul>
              {group.items.slice(0, group.take).map((item) => {
                const at = item.scheduledAt ?? item.updatedAt ?? item.createdAt;
                return (
                  <li key={item.key}>
                    <Link href={item.href} className="cmd-open-row">
                      <span className="cmd-open-main">
                        <span className="cmd-open-who">{personLabel(item.customer, item.phone)}</span>
                        <span className="cmd-open-what">{spokenText(item.title)}</span>
                        {item.nextAction ? <span className="cmd-open-next">{item.nextAction}</span> : null}
                      </span>
                      <span className="cmd-open-side">
                        <span>{item.stageLabel}</span>
                        {item.amountLabel ? <span>{item.amountLabel}</span> : null}
                        <time dateTime={at}>{formatWhen(at, new Date(), timezone) || "No time"}</time>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ))}
      {hidden > 0 || showAll ? (
        <button type="button" className="cmd-more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `${hidden} more`}
        </button>
      ) : null}
    </section>
  );
}

function Activity({ events, skipId, timezone }: { events: ActivityEvent[]; skipId: string | null; timezone?: string | null }) {
  const rows = events.filter((event) => event.id !== skipId).slice(0, 5);
  if (!rows.length) return null;
  return (
    <section className="cmd-section cmd-activity" aria-labelledby="desk-activity">
      <h3 id="desk-activity" className="cmd-section-title">
        Last 24 hours
      </h3>
      <ul>
        {rows.map((event) => {
          const href = event.jobId ? `/dashboard/jobs/${event.jobId}` : event.leadId ? `/dashboard/inbox/${event.leadId}` : null;
          const body = (
            <>
              <span className="cmd-activity-main">
                <span>{event.summary}</span>
                <span className="cmd-activity-by">
                  {event.by} · {event.result}
                </span>
              </span>
              <time dateTime={event.at}>{formatWhen(event.at, new Date(), timezone)}</time>
            </>
          );
          return (
            <li key={event.id}>
              {href ? (
                <Link href={href} className="cmd-activity-row">
                  {body}
                </Link>
              ) : (
                <div className="cmd-activity-row">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Open work first, then today beside the money. An empty day is a sentence,
 * not a blank pane. Nothing here is invented to fill the screen.
 */
export function DeskBoard({
  jobs,
  money,
  week,
  items,
  asideKey,
  timezone,
  tomorrow,
  conflicts,
  activity,
  activitySkipId,
}: {
  jobs: TodayJob[];
  money?: CommandMoney;
  week?: { jobsBooked: number; avgTicketCents: number | null; closed?: string | null };
  items: OpenItem[];
  asideKey: string | null;
  timezone?: string | null;
  tomorrow?: { jobCount: number; unassigned: number } | null;
  conflicts?: string[];
  activity?: ActivityEvent[];
  activitySkipId?: string | null;
}) {
  const lanes = lanesForToday(jobs);
  const groups = openGroups(items, asideKey, new Set(jobs.map((job) => job.id)));
  const openCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const clash = (conflicts ?? []).filter((line) => line.trim());

  return (
    <div className="cmd-desk">
      {openCount ? <OpenWork groups={groups} timezone={timezone} /> : null}

      <div className="cmd-desk-split">
        <section className="cmd-section" aria-labelledby="desk-today">
          <div className="cmd-section-head">
            <h3 id="desk-today" className="cmd-section-title">
              <Link href="/dashboard/schedule">Today</Link>
            </h3>
            <span className="cmd-section-note">{jobs.length === 0 ? "Nothing today" : jobs.length === 1 ? "1 job" : `${jobs.length} jobs`}</span>
          </div>
          {lanes.length ? (
            <div className="cmd-today">
              {lanes.map((lane) => (
                <div key={lane.tech} className={`cmd-today-lane${lane.tech === "Unassigned" ? " cmd-today-lane--open" : ""}`}>
                  <p className="cmd-today-tech">
                    {lane.tech}
                    <span>{lane.jobs.length === 1 ? "1 job" : `${lane.jobs.length} jobs`}</span>
                  </p>
                  <ul>
                    {lane.jobs.map((job) => (
                      <li key={job.id}>
                        <Link href={`/dashboard/jobs/${job.id}`} className="cmd-today-job">
                          <span className="cmd-today-time">{clock(job.scheduledAt, timezone)}</span>
                          <span className="cmd-today-title">
                            {spokenText(job.title)}
                            <span>{personLabel(job.customer?.name ?? job.lead?.name, job.customer?.phone ?? job.lead?.phone)}</span>
                          </span>
                          <span className={`cmd-today-status cmd-today-status--${job.status}`}>{STATUS[job.status] ?? job.status.replace(/_/g, " ")}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="cmd-empty">
              Nothing is on the schedule today.
              {tomorrow && tomorrow.jobCount > 0 ? (
                <>
                  {" "}
                  {tomorrow.jobCount === 1 ? "1 job is booked tomorrow." : `${tomorrow.jobCount} jobs are booked tomorrow.`}
                  {tomorrow.unassigned > 0
                    ? tomorrow.unassigned === 1
                      ? " 1 has no technician."
                      : ` ${tomorrow.unassigned} have no technician.`
                    : ""}{" "}
                  <Link href="/dashboard/schedule">Open the schedule</Link>
                </>
              ) : openCount ? (
                <> Open work is listed above.</>
              ) : (
                <>
                  {" "}
                  New calls show up in <Link href="/dashboard/inbox">Inbox</Link>.
                </>
              )}
            </p>
          )}
          {clash.length ? (
            <div className="cmd-conflicts">
              <p className="cmd-open-label">Schedule conflicts</p>
              <ul>
                {clash.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {money ? <Money money={money} week={week} /> : null}
      </div>

      {activity?.length ? <Activity events={activity} skipId={activitySkipId ?? null} timezone={timezone} /> : null}
    </div>
  );
}
