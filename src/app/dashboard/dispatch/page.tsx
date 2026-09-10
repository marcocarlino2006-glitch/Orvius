"use client";

import { AssignTechButton } from "@/components/assign-tech-button";
import { JobStatusAdvance } from "@/components/job-status-advance";
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
  onUpdated,
}: {
  job: BoardJob;
  technicians: Tech[];
  onUpdated: () => void;
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
      <Link href={`/dashboard/jobs/${job.id}`} className="dispatch-job-chip lead-rail-row">
        <div className="lead-rail-main">
          <div className="lead-rail-meta">
            <p className={`lead-rail-kind ${emergency ? "is-flare" : ""}`}>
              {emergency ? "Emergency" : "Dispatch"} · {jobStatusLabel(job.status)}
            </p>
            <span className="lead-rail-time">{time}</span>
          </div>
          <div className="lead-rail-title-row">
            <span className="lead-rail-name">{job.title}</span>
          </div>
          <p className="lead-rail-sub">
            {who}
            {job.address ? ` · ${job.address}` : ""}
          </p>
        </div>
      </Link>
      {needsAssign ? (
        <AssignTechButton
          jobId={job.id}
          technicians={technicians}
          onAssigned={onUpdated}
          compact
          className="dispatch-job-assign"
        />
      ) : (
        <JobStatusAdvance
          jobId={job.id}
          status={job.status}
          onAdvanced={onUpdated}
          compact
          className="dispatch-job-status"
        />
      )}
    </div>
  );
}

function CrewPhoneEdit({
  tech,
  onSaved,
}: {
  tech: Tech;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(tech.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing && tech.phone) {
    return (
      <button
        type="button"
        className="dispatch-crew-phone font-sans"
        onClick={() => setEditing(true)}
      >
        {tech.phone}
      </button>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="dispatch-crew-phone dispatch-crew-phone-missing font-sans"
        onClick={() => setEditing(true)}
      >
        Add mobile for SMS
      </button>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dispatch-crew-edit font-sans" onSubmit={save}>
      <input
        className="input dispatch-crew-edit-input"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="512-555-0100"
        autoComplete="tel"
        required
      />
      <button type="submit" className="btn btn-void text-xs" disabled={saving}>
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        className="btn btn-secondary text-xs"
        onClick={() => {
          setEditing(false);
          setPhone(tech.phone ?? "");
        }}
      >
        Cancel
      </button>
      {error ? <span className="dispatch-crew-edit-error">{error}</span> : null}
    </form>
  );
}

export default function DispatchPage() {
  const [day, setDay] = useState(todayInputValue);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [techName, setTechName] = useState("");
  const [techPhone, setTechPhone] = useState("");
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
    if (!techName.trim() || !techPhone.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: techName.trim(),
          phone: techPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add technician");
      setTechName("");
      setTechPhone("");
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
      {
        key: "unassigned",
        title: "Unassigned",
        jobs: board.unassigned,
        accent: true,
        technician: null as Tech | null,
      },
      ...board.columns.map((col) => ({
        key: col.technician.id,
        title: col.technician.name,
        jobs: col.jobs,
        accent: false,
        technician: col.technician,
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
      subtitle="Live field board — assign, advance status, SMS the tech. Map view next."
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
              placeholder="Name"
              required
            />
          </label>
          <label className="pro-toolbar-field font-sans">
            <span className="pro-toolbar-label">Mobile</span>
            <input
              className="input pro-toolbar-input"
              type="tel"
              value={techPhone}
              onChange={(e) => setTechPhone(e.target.value)}
              placeholder="512-555-0100"
              required
              autoComplete="tel"
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
      ) : !board?.jobCount ? (
        /*
          A day with no work used to render a column per crew member, each
          headed "0 jobs" and each saying "Nothing scheduled" — the same fact
          five times, in the five places you look first. Say it once, point at
          the thing to do about it, and keep the crew reachable underneath.
        */
        <>
          <ShellEmpty>
            No jobs scheduled for this day.{" "}
            <Link href="/dashboard/inbox" className="pro-section-link">
              Book from inbox
            </Link>
          </ShellEmpty>
          {technicians.length ? (
            <ul className="dispatch-crew-roster font-sans">
              {technicians.map((tech) => (
                <li key={tech.id} className="dispatch-crew-roster-item">
                  <span className="dispatch-crew-roster-name">{tech.name}</span>
                  <CrewPhoneEdit tech={tech} onSaved={load} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
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
                  {col.technician ? (
                    <CrewPhoneEdit tech={col.technician} onSaved={load} />
                  ) : null}
                </div>
                {col.accent && col.jobs.length > 0 ? (
                  <ShellBadge tone="neutral">Needs assign</ShellBadge>
                ) : null}
              </header>
              {col.jobs.length ? (
                <ul className="dispatch-col-list">
                  {col.jobs.map((job) => (
                    <li key={job.id}>
                      <JobChip job={job} technicians={technicians} onUpdated={load} />
                    </li>
                  ))}
                </ul>
              ) : (
                /*
                  The header above already says "0 jobs", so a sentence here
                  only repeats it — and on a quiet day it repeated it once per
                  column. A dashed slot says the column is empty rather than
                  broken, and says it without words.
                */
                <div className="dispatch-col-slot" aria-hidden />
              )}
            </section>
          ))}
        </div>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
