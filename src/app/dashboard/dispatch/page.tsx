"use client";

import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellEmpty } from "@/components/shell-primitives";
import { jobStatusLabel } from "@/lib/job-status";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Tech = { id: string; name: string; phone: string | null };
type BoardJob = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  urgency: string | null;
  technicianId: string | null;
  customer: { name: string | null; phone: string } | null;
  lead: { name: string | null; phone: string | null } | null;
};

type Board = {
  business: { id: string; name: string };
  day: string;
  jobCount: number;
  unassigned: BoardJob[];
  columns: Array<{ technician: Tech; jobs: BoardJob[] }>;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function JobChip({ job }: { job: BoardJob }) {
  const who = job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? "Customer";
  const time = job.scheduledAt
    ? new Date(job.scheduledAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD";

  return (
    <Link href={`/dashboard/jobs/${job.id}`} className="home-os-chip dispatch-job-chip">
      <div className="home-os-chip-head">
        <p className="home-os-chip-time">{time}</p>
        <ShellBadge
          tone={
            job.status === "on_site" || job.status === "en_route"
              ? "live"
              : job.status === "completed"
                ? "neutral"
                : "flare"
          }
        >
          {jobStatusLabel(job.status)}
        </ShellBadge>
      </div>
      <p className="home-os-chip-title font-serif">{job.title}</p>
      <p className="home-os-chip-sub">{who}</p>
      {job.address ? <p className="home-os-chip-sub">{job.address}</p> : null}
    </Link>
  );
}

export default function DispatchPage() {
  const [day, setDay] = useState(todayInputValue);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [techName, setTechName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/dispatch?day=${day}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dispatch");
        return res.json();
      })
      .then(setBoard)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTech(e: React.FormEvent) {
    e.preventDefault();
    if (!techName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: techName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add technician");
      setTechName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add technician");
    } finally {
      setAdding(false);
    }
  }

  const columns = useMemo(() => {
    if (!board) return [];
    return [
      { key: "unassigned", title: "Unassigned", jobs: board.unassigned },
      ...board.columns.map((col) => ({
        key: col.technician.id,
        title: col.technician.name,
        jobs: col.jobs,
      })),
    ];
  }, [board]);

  return (
    <OsShell
      title="Dispatch"
      subtitle="Who goes where. The day runs from this board."
      actions={
        <Link href="/dashboard/jobs" className="btn btn-void text-sm">
          All jobs
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <label className="font-sans">
          <span className="label">Day</span>
          <input
            type="date"
            className="input mt-1.5"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <form onSubmit={addTech} className="flex flex-wrap items-end gap-2">
          <label className="font-sans">
            <span className="label">Add technician</span>
            <input
              className="input mt-1.5"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              placeholder="Name"
            />
          </label>
          <button type="submit" className="btn btn-void" disabled={adding}>
            {adding ? "Adding…" : "Add to crew"}
          </button>
        </form>
      </div>

      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      {loading && !board ? (
        <p className="font-sans text-sm text-ash">Loading board…</p>
      ) : !board?.jobCount && !board?.columns.length ? (
        <ShellEmpty>No jobs on this day. Book a lead, then assign a tech.</ShellEmpty>
      ) : (
        <div className="dispatch-board">
          {columns.map((col) => (
            <section key={col.key} className="dispatch-col">
              <header className="dispatch-col-head">
                <p className="home-os-kicker">{col.title}</p>
                <p className="font-sans text-xs text-ash">
                  {col.jobs.length} job{col.jobs.length === 1 ? "" : "s"}
                </p>
              </header>
              {col.jobs.length ? (
                <ul className="space-y-3">
                  {col.jobs.map((job) => (
                    <li key={job.id}>
                      <JobChip job={job} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-ash">Clear.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </OsShell>
  );
}
