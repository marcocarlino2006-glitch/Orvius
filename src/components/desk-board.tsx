"use client";

import Link from "next/link";
import { useState } from "react";
import { lanesForToday, openGroups, type CommandMoney, type DeskItem, type DeskJob } from "@/lib/command-depth";
import { moneyBrief } from "@/lib/desk-status";
import { spokenName, spokenText } from "@/lib/spoken-name";

const SHOWN = 4;

type TodayJob = DeskJob & {
  title: string;
  status: string;
  scheduledAt: string | null;
  customer?: { name: string | null } | null;
  lead?: { name: string | null } | null;
};

type OpenItem = DeskItem & {
  href: string;
  title: string;
  customer: string | null;
  amountLabel: string | null;
  scheduledAt: string | null;
  createdAt: string;
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

function who(name: string | null | undefined): string {
  return spokenName(name) || "A caller";
}

function Money({ money }: { money: CommandMoney }) {
  const brief = moneyBrief(money);
  return (
    <section className="cmd-section" aria-labelledby="desk-money">
      <h3 id="desk-money" className="cmd-section-title">
        <Link href="/dashboard/reports">Money</Link>
      </h3>
      <p className="cmd-money-brief">{brief.summary}</p>
      {brief.owed ? (
        <p className="cmd-money-attention">
          <Link href="/dashboard/reports">{brief.owed}</Link>
        </p>
      ) : null}
      {brief.unbilled ? (
        <p className="cmd-money-attention">
          <Link href="/dashboard/jobs">{brief.unbilled}</Link>
        </p>
      ) : null}
    </section>
  );
}

function OpenGroup({ label, items, timezone }: { label: string; items: OpenItem[]; timezone?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, SHOWN);
  const hidden = items.length - SHOWN;
  return (
    <div className="cmd-open-group">
      <h4 className="cmd-open-label">
        {label}
        <span className="cmd-count">{items.length}</span>
      </h4>
      <ul>
        {shown.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="cmd-open-row">
              <span className="cmd-open-main">
                <span className="cmd-open-who">{who(item.customer)}</span>
                <span className="cmd-open-what">{spokenText(item.title)}</span>
              </span>
              <span className="cmd-open-side">
                <time dateTime={item.scheduledAt ?? item.createdAt}>{clock(item.scheduledAt ?? item.createdAt, timezone)}</time>
                {item.amountLabel ? <span>{item.amountLabel}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="cmd-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer" : `${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The rest of the desk: today's crew, the money, and open work that is not
 * already the decision at the top. Each job opens its own record.
 */
export function DeskBoard({
  jobs,
  money,
  items,
  asideKey,
  timezone,
}: {
  jobs: TodayJob[];
  money?: CommandMoney;
  items: OpenItem[];
  asideKey: string | null;
  timezone?: string | null;
}) {
  const lanes = lanesForToday(jobs);
  const groups = openGroups(items, asideKey, new Set(jobs.map((job) => job.id)));
  const openCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="cmd-desk">
      <section className="cmd-section" aria-labelledby="desk-today">
        <div className="cmd-section-head">
          <h3 id="desk-today" className="cmd-section-title">
            <Link href="/dashboard/schedule">Today</Link>
          </h3>
          <span className="cmd-section-note">{jobs.length === 1 ? "1 job" : `${jobs.length} jobs`}</span>
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
                          <span>{who(job.customer?.name ?? job.lead?.name)}</span>
                        </span>
                        <span className={`cmd-today-status cmd-today-status--${job.status}`}>{STATUS[job.status] ?? job.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="cmd-empty">Nothing booked today.</p>
        )}
      </section>

      {money ? <Money money={money} /> : null}

      {openCount ? (
        <section className="cmd-section cmd-open" aria-labelledby="desk-open">
          <div className="cmd-section-head">
            <h3 id="desk-open" className="cmd-section-title">
              Still open
            </h3>
            <span className="cmd-section-note">{openCount === 1 ? "1" : openCount}</span>
          </div>
          {groups.map((group) => (
            <OpenGroup key={group.stage} label={group.label} items={group.items} timezone={timezone} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
