"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cachedGet, forgetEverything, isGone, useFieldSync, useTechShell } from "@/components/tech-app/offline";
import { StatusPill, SyncBar, timeLabel, whenLabel } from "@/components/tech-app/shared";

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
};

type Day = {
  technician: { name: string };
  shop: { name: string; timezone: string };
  now: DayJob[];
  late: DayJob[];
  days: Array<{ key: string; label: string; jobs: DayJob[] }>;
};

function JobRow({ token, job, tz, showDay }: { token: string; job: DayJob; tz: string; showDay?: boolean }) {
  return (
    <li>
      <Link href={`/tech/${token}/jobs/${job.id}`} className={`ta-job${job.status === "completed" ? " is-done" : ""}`}>
        <span className="ta-job-time">{showDay ? whenLabel(job.scheduledAt, tz) : timeLabel(job.scheduledAt, tz)}</span>
        <span className="ta-job-body">
          <span className="ta-job-title">{job.title}</span>
          <span className="ta-job-meta">{[job.customerName, job.address?.split(",")[0]].filter(Boolean).join(" · ") || "No address yet"}</span>
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

  return (
    <main className="ta">
      <header className="ta-head">
        <p className="ta-kicker">{day.shop.name}</p>
        <h1 className="ta-title">{first}&apos;s day</h1>
        <p className="ta-sub">
          {dateLine} · {left ? `${left} job${left === 1 ? "" : "s"} left today` : "Nothing left today"}
        </p>
      </header>

      <SyncBar online={sync.online} savedAt={savedAt} queued={sync.queued.length} failed={sync.failed} timeZone={tz} onDismiss={sync.dismissFailed} />

      {error && !savedAt ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}

      {day.now.length ? (
        <section aria-label="In progress">
          <h2 className="ta-h2">Right now</h2>
          <ul className="ta-list ta-list--now">
            {day.now.map((job) => (
              <JobRow key={job.id} token={token} job={job} tz={tz} showDay />
            ))}
          </ul>
        </section>
      ) : null}

      {day.late.length ? (
        <section aria-label="Overdue">
          <h2 className="ta-h2 ta-h2--late">Not finished from earlier</h2>
          <ul className="ta-list">
            {day.late.map((job) => (
              <JobRow key={job.id} token={token} job={job} tz={tz} showDay />
            ))}
          </ul>
        </section>
      ) : null}

      {day.days.map((d) => (
        <section key={d.key} aria-label={d.label}>
          <h2 className="ta-h2">
            {d.label}
            <span>{d.jobs.length ? `${d.jobs.length} job${d.jobs.length === 1 ? "" : "s"}` : ""}</span>
          </h2>
          {d.jobs.length ? (
            <ul className="ta-list">
              {d.jobs.map((job) => (
                <JobRow key={job.id} token={token} job={job} tz={tz} />
              ))}
            </ul>
          ) : (
            <p className="ta-card ta-muted">Nothing on your schedule {d.label === "Today" ? "today" : "this day"}.</p>
          )}
        </section>
      ))}
    </main>
  );
}
