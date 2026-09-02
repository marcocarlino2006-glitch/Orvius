"use client";

import { AssignTechButton } from "@/components/assign-tech-button";
import { ProPageStrip } from "@/components/pro-page-strip";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
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
  crew?: Tech[];
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function JobChip({
  job,
  technicians,
  onAssigned,
}: {
  job: BoardJob;
  technicians: Tech[];
  onAssigned: () => void;
}) {
  const who = job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? "Customer";
  const time = job.scheduledAt
    ? new Date(job.scheduledAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD";
  const emergency = job.urgency?.toLowerCase() === "emergency";
  const needsAssign = !job.technicianId;

  return (
    <div className="dispatch-job-chip-wrap">
      <Link href={`/dashboard/jobs/${job.id}`} className="dispatch-job-chip pro-card">
        <div className="dispatch-job-chip-head">
          <p className="dispatch-job-chip-time font-sans">{time}</p>
          <div className="flex flex-wrap gap-1.5">
            {emergency ? <ShellBadge tone="flare">Emergency</ShellBadge> : null}
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
        </div>
        <p className="dispatch-job-chip-title font-sans">{job.title}</p>
        <p className="dispatch-job-chip-sub font-sans">{who}</p>
        {job.address ? <p className="dispatch-job-chip-sub font-sans">{job.address}</p> : null}
      </Link>
      {needsAssign && technicians.length ? (
        <AssignTechButton
          jobId={job.id}
          technicians={technicians}
          onAssigned={onAssigned}
          compact
          className="dispatch-job-assign"
        />
      ) : null}
    </div>
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
      { key: "unassigned", title: "Unassigned", jobs: board.unassigned, accent: true },
      ...board.columns.map((col) => ({
        key: col.technician.id,
        title: col.technician.name,
        jobs: col.jobs,
        accent: false,
      })),
    ];
  }, [board]);

  const technicians = useMemo(() => {
    if (!board) return [];
    if (board.crew?.length) return board.crew;
    return board.columns.map((col) => col.technician);
  }, [board]);

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

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
      <PlanUpgradeGate module="dispatch">
      <ProPageStrip />

      <div className="pro-dispatch-head font-sans">
        <p className="pro-dispatch-day">{dayLabel}</p>
        <p className="pro-dispatch-count">
          {board?.jobCount ?? 0} job{board?.jobCount === 1 ? "" : "s"} scheduled
        </p>
      </div>

      <div className="pro-toolbar pro-page-toolbar">
        <label className="pro-toolbar-field font-sans">
          <span className="pro-toolbar-label">Day</span>
          <input
            type="date"
            className="input pro-toolbar-input"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <form onSubmit={addTech} className="pro-toolbar-form">
          <label className="pro-toolbar-field font-sans">
            <span className="pro-toolbar-label">Add technician</span>
            <input
              className="input pro-toolbar-input"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              placeholder="Crew member name"
            />
          </label>
          <button type="submit" className="btn btn-void text-sm" disabled={adding}>
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
        <div className="dispatch-board">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dispatch-col dispatch-col-loading" aria-hidden>
              <div className="ring1-shimmer h-4 w-24 rounded" />
              <div className="mt-4 space-y-3">
                <div className="ring1-shimmer h-20 w-full rounded-md" />
                <div className="ring1-shimmer h-20 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : !board?.jobCount && !board?.columns.length ? (
        <ShellEmpty>
          No jobs scheduled for this day.{" "}
          <Link href="/dashboard/inbox" className="pro-section-link">
            Book from inbox
          </Link>
        </ShellEmpty>
      ) : (
        <div className="dispatch-board">
          {columns.map((col) => (
            <section
              key={col.key}
              className={`dispatch-col ${col.accent ? "dispatch-col-unassigned" : ""}`}
            >
              <header className="dispatch-col-head">
                <div>
                  <p className="pro-section-kicker font-sans">{col.title}</p>
                  <p className="dispatch-col-count font-sans">
                    {col.jobs.length} job{col.jobs.length === 1 ? "" : "s"}
                  </p>
                </div>
                {col.accent && col.jobs.length > 0 ? (
                  <ShellBadge tone="flare">Needs assign</ShellBadge>
                ) : null}
              </header>
              {col.jobs.length ? (
                <ul className="dispatch-col-list">
                  {col.jobs.map((job) => (
                    <li key={job.id}>
                      <JobChip job={job} technicians={technicians} onAssigned={load} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dispatch-col-empty font-sans">Nothing scheduled</p>
              )}
            </section>
          ))}
        </div>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
