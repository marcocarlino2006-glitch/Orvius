"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OsShell } from "@/components/os-shell";
import { WorkCard } from "@/components/work-card";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { spokenName, spokenText } from "@/lib/spoken-name";
import type { WorkItem } from "@/lib/work";

type Assignee = { email: string; role: string };
type Payload = { items: WorkItem[]; truncated: boolean; assignees: Assignee[]; needsYou: number };

const FILTERS: Array<{ id: string; label: string; match: (i: WorkItem) => boolean }> = [
  { id: "you", label: "Needs you", match: (i) => i.needsYou },
  { id: "all", label: "All open", match: () => true },
  { id: "requests", label: "Requests", match: (i) => i.kind === "request" },
  { id: "jobs", label: "Jobs", match: (i) => i.kind === "job" },
  { id: "callback", label: "Needs a callback", match: (i) => i.stage === "needs_callback" },
  { id: "time", label: "Needs a time", match: (i) => i.stage === "needs_time" },
  { id: "scheduled", label: "Scheduled", match: (i) => i.stage === "scheduled" || i.stage === "confirmed" },
  { id: "field", label: "In the field", match: (i) => i.stage === "on_the_way" || i.stage === "on_site" },
  { id: "customer", label: "Waiting on customer", match: (i) => i.waitingOn === "customer" },
  { id: "payment", label: "Payment due", match: (i) => i.stage === "done" },
];

export default function WorkPage() {
  const [view, setView] = useState<"open" | "closed">("open");
  const [filter, setFilter] = useState("you");
  const [data, setData] = useState<Payload | null>(null);
  const [techs, setTechs] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: "open" | "closed") => {
    setError(null);
    const res = await fetch(`/api/work?view=${which}`).catch(() => null);
    const next = res?.ok ? ((await res.json().catch(() => null)) as Payload | null) : null;
    if (!next || !Array.isArray(next.items)) throw new Error("Couldn't load your work.");
    setData(next);
  }, []);

  useEffect(() => {
    setData(null);
    load(view).catch((e: Error) => setError(e.message));
  }, [view, load]);

  useEffect(() => {
    fetch("/api/technicians")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { technicians?: Array<{ id: string; name: string }> } | null) => {
        if (body?.technicians) setTechs(body.technicians.map((tech) => ({ id: tech.id, name: tech.name })));
      })
      .catch(() => {});
  }, []);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, data?.items.filter(f.match).length ?? 0])),
    [data],
  );
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (view === "closed") return items;
    return items.filter(FILTERS.find((f) => f.id === filter)!.match);
  }, [data, filter, view]);

  const first = rows[0];
  const headline = !data
    ? "Reading the shop…"
    : !first
      ? view === "closed"
        ? "Nothing closed in the last 30 days."
        : filter === "you"
          ? "Nothing needs you."
          : "Nothing in this view."
      : spokenName(first.customer)
        ? `${spokenName(first.customer)}. ${spokenText(first.nextAction || first.title)}`
        : spokenText(first.nextAction || first.title);

  return (
    <OsShell
      title="Work"
      actions={
        <Link href="/dashboard/jobs/new" className="btn btn-void text-sm">
          New job
        </Link>
      }
    >
      <div className="cmd cmd-one">
        {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
        <header className="cmd-head">
          <h2 className="cmd-headline os-own-color">{headline}</h2>
        </header>
        <div className="cmd-filters font-sans" role="tablist" aria-label="Work">
          {view === "open"
            ? FILTERS.filter((f) => f.id === "you" || f.id === "all" || f.id === filter || counts[f.id] > 0).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={filter === f.id ? "is-on" : ""}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))
            : null}
          <button
            type="button"
            role="tab"
            aria-selected={view === "closed"}
            className={view === "closed" ? "is-on" : ""}
            onClick={() => setView(view === "closed" ? "open" : "closed")}
          >
            {view === "closed" ? "Back to open work" : "Closed, last 30 days"}
          </button>
        </div>
        {!data && error ? (
          <ProEmptyState
            title="Work didn't load"
            body="Nothing here is changed by this. Try again, or open Jobs and Inbox directly."
            action={
              <button type="button" className="btn btn-secondary text-sm" onClick={() => void load(view).catch((e: Error) => setError(e.message))}>
                Try again
              </button>
            }
          />
        ) : !data ? (
          <DashboardSkeleton />
        ) : rows.length === 0 ? (
          <ProEmptyState
            title={view === "closed" ? "Nothing closed in the last 30 days" : filter === "you" ? "Nothing needs you" : "No open work"}
            body={
              view === "closed"
                ? "Finished work shows here for a month. What is still open is on the other tab."
                : filter === "you"
                  ? "You're clear. The rest of the day is under All open."
                  : "Work shows up here after a request is booked. Anything still waiting is in the Inbox."
            }
            action={
              view === "closed" ? null : filter === "you" ? (
                <button type="button" className="btn btn-secondary text-sm" onClick={() => setFilter("all")}>
                  All open
                </button>
              ) : (
                <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
                  Open Inbox
                </Link>
              )
            }
          />
        ) : (
          <ul className="wc-list" aria-label="Work">
            {rows.map((item) => (
              <WorkCard key={item.key} item={item} technicians={techs} onChange={() => void load(view).catch((e: Error) => setError(e.message))} />
            ))}
          </ul>
        )}
        {data?.truncated ? (
          <p className="font-sans text-sm text-ash">Showing the 300 newest requests and jobs. Search finds anything older.</p>
        ) : null}
      </div>
    </OsShell>
  );
}
