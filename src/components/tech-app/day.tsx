"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cachedGet, forgetEverything, isGone, useFieldSync, useTechShell } from "@/components/tech-app/offline";
import { StatusPill, SyncBar, timeLabel, whenLabel } from "@/components/tech-app/shared";
import { spokenName } from "@/lib/spoken-name";

type DayJob = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  durationMin: number | null;
  address: string | null;
  urgency: string | null;
  customerName: string | null;
  customerPhone: string | null;
  hasNotes: boolean;
  needsAnswer?: boolean;
  /** Outcome and amount once the visit is finished. Absent on a day saved before this. */
  finished?: string | null;
};

type TruckPart = { id: string; name: string; onTruck: number };

type Day = {
  technician: { name: string };
  shop: { name: string; timezone: string };
  now: DayJob[];
  late: DayJob[];
  days: Array<{ key: string; label: string; jobs: DayJob[] }>;
  /** Counted parts. Absent on a day saved before the truck was on this screen. */
  truck?: TruckPart[];
};

function JobRow({ token, job, tz, showDay }: { token: string; job: DayJob; tz: string; showDay?: boolean }) {
  return (
    <li>
      <Link href={`/tech/${token}/jobs/${job.id}`} className={`ta-job${job.status === "completed" ? " is-done" : ""}`}>
        <span className="ta-job-time">{showDay ? whenLabel(job.scheduledAt, tz) : timeLabel(job.scheduledAt, tz)}</span>
        <span className="ta-job-body">
          <span className="ta-job-title">{job.title}</span>
          <span className="ta-job-meta">{[spokenName(job.customerName), job.address?.split(",")[0]].filter(Boolean).join(" · ") || "No address yet"}</span>
          {job.finished ? <span className="ta-job-meta">{job.finished}</span> : null}
          {job.needsAnswer ? <span className="ta-job-ask">Needs your answer</span> : null}
        </span>
        <StatusPill status={job.status} urgency={job.urgency} />
      </Link>
    </li>
  );
}

const KEEP_JOBS = 12;
let keptAt = 0;

/** Save the jobs still ahead today (and anything in progress) on the phone, so each one opens in a basement. */
async function keepJobsOnPhone(token: string, day: Day) {
  if (Date.now() - keptAt < 5 * 60_000) return;
  keptAt = Date.now();
  const soon = [...day.now, ...day.late, ...(day.days[0]?.jobs ?? []), ...(day.days[1]?.jobs ?? [])].filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const ids = [...new Set(soon.map((j) => j.id))].slice(0, KEEP_JOBS);
  for (const id of ids) {
    await cachedGet(`/api/tech/${token}/jobs/${id}`).catch(() => undefined);
    await fetch(`/tech/${token}/jobs/${id}`, { credentials: "same-origin" }).catch(() => undefined);
  }
}

/** A technician's day: what they are in the middle of, anything overdue, then each day's jobs. */
export function TechDay({ token }: { token: string }) {
  const [day, setDay] = useState<Day | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, savedAt: at } = await cachedGet<Day>(`/api/tech/${token}`);
      setDay(data);
      setSavedAt(at);
      setError(null);
      if (!at) void keepJobsOnPhone(token, data);
    } catch (err) {
      if (isGone(err)) {
        forgetEverything();
        setDay(null);
      }
      setError(err instanceof Error ? err.message : "Couldn't load your day.");
    }
  }, [token]);
  const sync = useFieldSync(() => void load());
  useTechShell();

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (!day) {
    return (
      <main className="ta">
        {error ? (
          <section className="ta-card ta-empty">
            <h1 className="ta-title">Can&apos;t open your day</h1>
            <p className="ta-muted">{error}</p>
          </section>
        ) : (
          <p className="ta-muted" aria-busy>
            Loading your day…
          </p>
        )}
      </main>
    );
  }

  const tz = day.shop.timezone;
  const first = day.technician.name.split(/\s+/)[0];
  const today = day.days.find((d) => d.label === "Today");
  const left = today?.jobs.filter((j) => j.status !== "completed").length ?? 0;
  const dateLine = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const next = day.now[0] ?? day.late[0] ?? today?.jobs.find((job) => job.status !== "completed" && job.status !== "cancelled") ?? null;
  const rest = (jobs: DayJob[]) => (next ? jobs.filter((job) => job.id !== next.id) : jobs);
  const nextWhen = next ? whenLabel(next.scheduledAt, tz) : "";
  const nextWhere = next ? [spokenName(next.customerName), next.address?.split(",")[0]].filter(Boolean).join(" · ") : "";

  return (
    <main className="ta">
      <header className="ta-head">
        <p className="ta-kicker">{day.shop.name}</p>
        {next ? (
          <Link href={`/tech/${token}/jobs/${next.id}`} className="ta-next">
            <h1 className="ta-title">{nextWhen}. {next.title}</h1>
            {nextWhere ? <p className="ta-sub">{nextWhere}</p> : null}
          </Link>
        ) : (
          <h1 className="ta-title">{first}&apos;s day</h1>
        )}
        <p className="ta-sub">
          {dateLine} · {left ? `${left} job${left === 1 ? "" : "s"} left today` : "Nothing left today"}
        </p>
      </header>

      <SyncBar online={sync.online} savedAt={savedAt} queued={sync.queued.length} failed={sync.failed} timeZone={tz} onDismiss={sync.dismissFailed} />

      {day.truck?.length ? (
        <section aria-label="On the truck">
          <h2 className="ta-h2">On the truck</h2>
          <ul className="ta-list">
            {day.truck.map((part) => (
              <li key={part.id} className="ta-truck">
                <span>{part.name}</span>
                <span>{part.onTruck}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error && !savedAt ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}

      {rest(day.now).length ? (
        <section aria-label="In progress">
          <h2 className="ta-h2">Right now</h2>
          <ul className="ta-list ta-list--now">
            {rest(day.now).map((job) => (
              <JobRow key={job.id} token={token} job={job} tz={tz} showDay />
            ))}
          </ul>
        </section>
      ) : null}

      {rest(day.late).length ? (
        <section aria-label="Overdue">
          <h2 className="ta-h2 ta-h2--late">Not finished from earlier</h2>
          <ul className="ta-list">
            {rest(day.late).map((job) => (
              <JobRow key={job.id} token={token} job={job} tz={tz} showDay />
            ))}
          </ul>
        </section>
      ) : null}

      {day.days.map((d) => {
        const jobs = rest(d.jobs);
        if (!jobs.length && d.jobs.length) return null;
        return (
        <section key={d.key} aria-label={d.label}>
          <h2 className="ta-h2">
            {d.label}
            <span>{jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : ""}</span>
          </h2>
          {jobs.length ? (
            <ul className="ta-list">
              {jobs.map((job) => (
                <JobRow key={job.id} token={token} job={job} tz={tz} />
              ))}
            </ul>
          ) : (
            <p className="ta-card ta-muted">Nothing on your schedule {d.label === "Today" ? "today" : "this day"}.</p>
          )}
        </section>
        );
      })}
    </main>
  );
}
