"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OsShell } from "@/components/os-shell";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { ShellAlert, ShellBadge } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { formatWhen } from "@/lib/when";
import type { WorkItem, WorkStage } from "@/lib/work";

type Assignee = { email: string; role: string };
type Payload = { items: WorkItem[]; truncated: boolean; assignees: Assignee[] };

const FILTERS: Array<{ id: string; label: string; match: (i: WorkItem) => boolean }> = [
  { id: "all", label: "All open", match: () => true },
  { id: "callback", label: "Needs a callback", match: (i) => i.stage === "needs_callback" },
  { id: "time", label: "Needs a time", match: (i) => i.stage === "needs_time" },
  { id: "scheduled", label: "Scheduled", match: (i) => i.stage === "scheduled" || i.stage === "confirmed" },
  { id: "field", label: "In the field", match: (i) => i.stage === "on_the_way" || i.stage === "on_site" },
  { id: "payment", label: "Payment due", match: (i) => i.stage === "done" },
];

const TONE: Record<WorkStage, "live" | "flare" | "neutral" | "muted"> = {
  needs_callback: "flare",
  needs_time: "flare",
  scheduled: "neutral",
  confirmed: "live",
  on_the_way: "live",
  on_site: "live",
  done: "muted",
  cancelled: "muted",
  spam: "muted",
};

export default function WorkPage() {
  const [view, setView] = useState<"open" | "closed">("open");
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: "open" | "closed") => {
    setError(null);
    const res = await fetch(`/api/work?view=${which}`);
    if (!res.ok) throw new Error("Couldn't load your work. Refresh to try again.");
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    setData(null);
    load(view).catch((e: Error) => setError(e.message));
  }, [view, load]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, data?.items.filter(f.match).length ?? 0])),
    [data],
  );
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (view === "closed") return items;
    return items.filter(FILTERS.find((f) => f.id === filter)!.match);
  }, [data, filter, view]);

  async function assign(item: WorkItem, email: string | null) {
    const res = await fetch("/api/work", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: item.kind, id: item.id, email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't change who is responsible.");
      return;
    }
    await load(view).catch((e: Error) => setError(e.message));
  }

  return (
    <OsShell
      title="Work"
      subtitle="Every request and job, from the first call to the last payment."
      actions={
        <Link href="/dashboard/jobs/new" className="btn btn-void text-sm">
          New job
        </Link>
      }
    >
      {error ? (
        <div className="mb-4">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      <div className="jobs-pipeline font-sans" role="tablist" aria-label="Work">
        {view === "open"
          ? FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`jobs-pipeline-stage ${filter === f.id ? "jobs-pipeline-stage-active" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                <span className="jobs-pipeline-label">{f.label}</span>
                <span className="jobs-pipeline-count">{counts[f.id]}</span>
              </button>
            ))
          : null}
        <button
          type="button"
          role="tab"
          aria-selected={view === "closed"}
          className={`jobs-pipeline-stage ${view === "closed" ? "jobs-pipeline-stage-active" : ""}`}
          onClick={() => setView(view === "closed" ? "open" : "closed")}
        >
          <span className="jobs-pipeline-label">{view === "closed" ? "Back to open work" : "Closed, last 30 days"}</span>
        </button>
      </div>

      {!data ? (
        <DashboardSkeleton />
      ) : rows.length === 0 ? (
        <ProEmptyState
          title={view === "open" ? "Nothing waiting on you" : "Nothing closed in the last 30 days"}
          body={
            view === "open"
              ? "Calls, texts and bookings land here as work, each with who's on it and what happens next."
              : "Finished, cancelled and spam work shows here for a month."
          }
        />
      ) : (
        <div className="dt dt--work font-sans" role="table" aria-label="Work">
          <div className="dt-head" role="row">
            <span role="columnheader">Work</span>
            <span role="columnheader">Stage</span>
            <span role="columnheader">Next</span>
            <span role="columnheader">Responsible</span>
            <span role="columnheader">Updated</span>
          </div>
          {rows.map((item) => (
            <div key={item.key} className="dt-row dt-row--link" role="row">
              <div role="cell" className="dt-primary">
                <Link href={item.href} className="dt-title dt-row-link">
                  {item.title}
                  {item.urgent ? <span className="work-urgent">Urgent</span> : null}
                </Link>
                <span className="text-ash">
                  {[item.customer, item.scheduledAt ? formatWhen(item.scheduledAt) : null].filter(Boolean).join(" · ") || "Unknown caller"}
                </span>
              </div>
              <div role="cell">
                <ShellBadge tone={TONE[item.stage]}>{item.stageLabel}</ShellBadge>
              </div>
              <div role="cell" className="work-next">
                {item.nextAction ?? <span className="text-ash">Nothing to do</span>}
              </div>
              <div role="cell">
                <select
                  className="work-assignee"
                  aria-label={`Who is responsible for ${item.title}`}
                  value={item.responsible.email ?? ""}
                  onChange={(e) => void assign(item, e.target.value || null)}
                >
                  <option value="">{item.responsible.kind === "technician" ? item.responsible.label : "You (owner)"}</option>
                  {(data.assignees ?? [])
                    .filter((a) => a.role !== "owner")
                    .map((a) => (
                      <option key={a.email} value={a.email}>
                        {a.email}
                      </option>
                    ))}
                </select>
              </div>
              <div role="cell" className="text-ash">
                {formatWhen(item.updatedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.truncated ? (
        <p className="mt-3 font-sans text-sm text-ash">Showing the 300 newest requests and jobs. Older ones are on the Jobs and Inbox screens.</p>
      ) : null}
    </OsShell>
  );
}
