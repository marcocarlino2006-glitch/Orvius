"use client";

import { RecordLink } from "@/components/record-drawer";
import { ProLead } from "@/components/pro-lead";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { AssignTechButton } from "@/components/assign-tech-button";
import type { DispatchSchedule, ScheduleBlock, UnassignedItem } from "@/lib/dispatch-schedule";
import { skillOptions } from "@/lib/trade-playbooks";
import type { Trade } from "@/lib/trades";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Tech = { id: string; name: string; phone: string | null; skillsJson?: string };

type Board = {
  business: { id: string; name: string };
  day: string;
  /** The shop's current day, which can differ from the browser's. */
  today: string;
  jobCount: number;
  crew?: Tech[];
  schedule: DispatchSchedule;
  trade: string | null;
};

function toInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(value: string, days: number) {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toInputValue(d);
}

function clock(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

function hours(min: number) {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

function parseSkills(json?: string): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

const label = (skill: string) => skill.replace(/_/g, " ");

function Block({
  block,
  window,
  unassigned,
}: {
  block: Pick<ScheduleBlock, "id" | "title" | "startMin" | "endMin" | "urgency" | "customerName"> & {
    conflict?: string | null;
  };
  window: { startMin: number; endMin: number };
  unassigned?: boolean;
}) {
  const span = window.endMin - window.startMin;
  const left = ((block.startMin - window.startMin) / span) * 100;
  const width = Math.max(((block.endMin - block.startMin) / span) * 100, 2.5);
  const tone = block.conflict ? "is-conflict" : block.urgency === "emergency" ? "is-emergency" : unassigned ? "is-open" : "";
  return (
    <RecordLink
      type="job"
      id={block.id}
      href={`/dashboard/jobs/${block.id}`}
      className={`dsp-block ${tone}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={block.conflict ?? `${block.title} · ${clock(block.startMin)}–${clock(block.endMin)}`}
    >
      <span className="dsp-block-time">{clock(block.startMin)}</span>
      <span className="dsp-block-title">{block.title}</span>
      {block.customerName ? <span className="dsp-block-who">{block.customerName}</span> : null}
    </RecordLink>
  );
}

/** The schedule as a list, for screens too narrow for the timeline. */
function AgendaLane({
  name,
  meta,
  blocks,
  unassigned,
}: {
  name: string;
  meta: string;
  blocks: Array<Pick<ScheduleBlock, "id" | "title" | "startMin" | "endMin" | "urgency" | "customerName"> & { conflict?: string | null }>;
  unassigned?: boolean;
}) {
  return (
    <div className="dsp-agenda-lane">
      <p className="dsp-agenda-head">
        <span className="dsp-lane-tech">{name}</span>
        <span className="dsp-lane-meta">{meta}</span>
      </p>
      {blocks.map((b) => (
        <RecordLink
          key={b.id}
          type="job"
          id={b.id}
          href={`/dashboard/jobs/${b.id}`}
          className={`dsp-agenda-row ${b.conflict ? "is-conflict" : b.urgency === "emergency" ? "is-emergency" : unassigned ? "is-open" : ""}`}
        >
          <span className="dsp-agenda-time">
            {clock(b.startMin)}–{clock(b.endMin)}
          </span>
          <span className="dsp-agenda-what">
            <span className="dsp-block-title">{b.title}</span>
            {b.customerName ? <span className="dsp-block-who">{b.customerName}</span> : null}
            {b.conflict ? <span className="dsp-agenda-conflict">{b.conflict}</span> : null}
          </span>
        </RecordLink>
      ))}
    </div>
  );
}

function Decision({
  item,
  technicians,
  onDone,
}: {
  item: UnassignedItem;
  technicians: Tech[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!item.recommendation) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: item.recommendation.technicianId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Assign failed");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? `${err.message}. Nothing was changed.` : "Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`dsp-decision ${item.urgency === "emergency" ? "is-emergency" : ""}`}>
      <div className="dsp-decision-main">
        <RecordLink type="job" id={item.id} href={`/dashboard/jobs/${item.id}`} className="dsp-decision-title">
          {item.urgency === "emergency" ? "Emergency · " : ""}
          {item.title}
        </RecordLink>
        <p className="dsp-decision-meta">
          {[item.startMin != null ? clock(item.startMin) : "No time", item.customerName, item.address, label(item.skill)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.recommendation ? (
          <p className="dsp-decision-why">
            <strong>{item.recommendation.name}</strong> — {item.recommendation.reason}.
          </p>
        ) : (
          <p className="dsp-decision-why is-blocked">{item.blocked}</p>
        )}
        {error ? (
          <p className="dsp-decision-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="dsp-decision-act">
        {item.recommendation ? (
          <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy} onClick={() => void accept()}>
            {busy ? "Assigning…" : `Assign ${item.recommendation.name.split(" ")[0]}`}
          </button>
        ) : item.startMin == null ? (
          <RecordLink type="job" id={item.id} href={`/dashboard/jobs/${item.id}`} className="ox-btn ox-btn--quiet ox-btn--sm">
            Set a time
          </RecordLink>
        ) : (
          <AssignTechButton jobId={item.id} technicians={technicians} onAssigned={onDone} compact />
        )}
      </div>
    </li>
  );
}

function CrewMember({
  tech,
  trade,
  onSaved,
}: {
  tech: Tech;
  trade: Trade | null;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(tech.phone ?? "");
  const [skills, setSkills] = useState<string[]>(() => parseSkills(tech.skillsJson));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = skillOptions(trade);
  const dirty =
    phone.trim() !== (tech.phone ?? "") ||
    JSON.stringify([...skills].sort()) !== JSON.stringify([...parseSkills(tech.skillsJson)].sort());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() || null, skills }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not save");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dsp-crew-row" onSubmit={save}>
      <div className="dsp-crew-id">
        <span className="dsp-crew-name">{tech.name}</span>
        <input
          className="input dsp-crew-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile for job texts"
          autoComplete="tel"
          aria-label={`${tech.name} mobile`}
        />
      </div>
      <fieldset className="dsp-skills">
        <legend className="sr-only">{tech.name} skills</legend>
        {options.map((opt) => {
          const on = skills.includes(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              className={`dsp-skill ${on ? "is-on" : ""}`}
              aria-pressed={on}
              onClick={() => setSkills((cur) => (on ? cur.filter((s) => s !== opt.key) : [...cur, opt.key]))}
            >
              {opt.label}
            </button>
          );
        })}
        {!skills.length ? <span className="dsp-skill-note">Takes any job</span> : null}
      </fieldset>
      <div className="dsp-crew-save">
        {error ? <span className="dsp-decision-error">{error}</span> : null}
        <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function AddTechnician({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not add technician");
      setName("");
      setPhone("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add technician");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dsp-add" onSubmit={add}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required aria-label="Technician name" />
      <input
        className="input"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Mobile"
        required
        autoComplete="tel"
        aria-label="Technician mobile"
      />
      <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy}>
        {busy ? "Adding…" : "Add technician"}
      </button>
      {error ? <span className="dsp-decision-error">{error}</span> : null}
    </form>
  );
}

export default function DispatchPage() {
  const [picked, setPicked] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(picked ? `/api/dispatch?day=${picked}` : "/api/dispatch")
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "Dispatch did not load.");
        return res.json();
      })
      .then(setBoard)
      .catch((err) => {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setError(offline ? "You are offline. The last schedule is still shown." : err.message);
      })
      .finally(() => setLoading(false));
  }, [picked]);

  useEffect(() => {
    load();
  }, [load]);

  const crew = useMemo(() => board?.crew ?? [], [board]);
  const schedule = board?.schedule;
  const axis = schedule?.window ?? { startMin: 7 * 60, endMin: 19 * 60 };
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let m = axis.startMin; m <= axis.endMin; m += 60) out.push(m);
    return out;
  }, [axis.startMin, axis.endMin]);
  const openScheduled = schedule?.unassigned.filter((u) => u.startMin != null) ?? [];
  const today = board?.today ?? toInputValue(new Date());
  const day = picked ?? today;
  const setDay = (next: string | ((d: string) => string)) =>
    setPicked(typeof next === "function" ? next(day) : next);
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const trade = (board?.trade ?? null) as Trade | null;
  const decisions = schedule?.unassigned.length ?? 0;
  const conflicts = schedule?.conflicts ?? [];

  return (
    <OsShell title="Dispatch">
      <PlanUpgradeGate module="dispatch">
        <ProLead
          loading={loading && !board}
          figure={String(board?.jobCount ?? 0)}
          caption="Scheduled"
          facts={[
            { label: "Unassigned", value: decisions, live: decisions > 0 },
            { label: "Conflicts", value: conflicts.length, live: conflicts.length > 0 },
            { label: "Crew", value: crew.length },
          ]}
        />

        <div className="dsp-toolbar">
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="Previous day">
            ←
          </button>
          <input type="date" className="input dsp-date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setDay((d) => shiftDay(d, 1))} aria-label="Next day">
            →
          </button>
          {day !== today ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setPicked(null)}>
              Today
            </button>
          ) : null}
          {loading && board ? <span className="dsp-refreshing">Refreshing…</span> : null}
        </div>

        {error ? (
          <div className="ox-state ox-state--failure ox-state--inline" role="alert">
            <p className="ox-state-title">Schedule not updated</p>
            <p className="ox-state-copy">{error}</p>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}

        {loading && !board ? (
          <div className="dsp-grid" aria-hidden>
            {[1, 2, 3].map((i) => (
              <div key={i} className="dsp-lane">
                <span className="skeleton dsp-skel-name" />
                <span className="skeleton dsp-skel-track" />
              </div>
            ))}
          </div>
        ) : board && schedule ? (
          <>
            {decisions || conflicts.length ? (
              <section className="dsp-section" aria-labelledby="dsp-decide">
                <h2 id="dsp-decide" className="dsp-h">
                  Needs a decision
                </h2>
                {conflicts.length ? (
                  <ul className="dsp-conflicts">
                    {conflicts.map((c) => (
                      <li key={c.jobIds.join("-")}>
                        <RecordLink type="job" id={c.jobIds[1]!} href={`/dashboard/jobs/${c.jobIds[1]}`} className="dsp-conflict">
                          {c.message}
                        </RecordLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {decisions ? (
                  <ul className="dsp-decisions">
                    {schedule.unassigned.map((item) => (
                      <Decision key={item.id} item={item} technicians={crew} onDone={load} />
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {!board.jobCount ? (
              <ProEmptyState
                title="Nothing scheduled this day"
                body="Calls Orvius books land here with a technician already picked. Pick another day, or book from the inbox."
                action={
                  <Link href="/dashboard/inbox" className="ox-btn ox-btn--quiet ox-btn--sm">
                    Open inbox
                  </Link>
                }
              />
            ) : (
              <section className="dsp-section" aria-labelledby="dsp-sched">
                <h2 id="dsp-sched" className="dsp-h">
                  Schedule
                </h2>
                <div className="dsp-grid" role="table" aria-label={`Schedule for ${dayLabel}`}>
                  <div className="dsp-lane dsp-lane--axis" role="row">
                    <span className="dsp-lane-name" />
                    <div className="dsp-track dsp-axis">
                      {ticks.map((t) => (
                        <span
                          key={t}
                          className="dsp-tick"
                          style={{ left: `${((t - axis.startMin) / (axis.endMin - axis.startMin)) * 100}%` }}
                        >
                          {clock(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {openScheduled.length ? (
                    <div className="dsp-lane dsp-lane--open" role="row">
                      <div className="dsp-lane-name">
                        <span className="dsp-lane-tech">Unassigned</span>
                        <span className="dsp-lane-meta">{openScheduled.length} waiting</span>
                      </div>
                      <div className="dsp-track">
                        {openScheduled.map((u) => (
                          <Block
                            key={u.id}
                            block={{ ...u, startMin: u.startMin!, endMin: u.endMin! }}
                            window={axis}
                            unassigned
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {schedule.lanes.map((lane) => (
                    <div key={lane.technician.id} className="dsp-lane" role="row">
                      <div className="dsp-lane-name">
                        <span className="dsp-lane-tech">{lane.technician.name}</span>
                        <span className="dsp-lane-meta">
                          {lane.blocks.length ? `${hours(lane.bookedMin)} booked` : "Free all day"}
                          {lane.technician.skills.length ? ` · ${lane.technician.skills.map(label).join(", ")}` : ""}
                        </span>
                      </div>
                      <div className="dsp-track">
                        {ticks.map((t) => (
                          <span
                            key={t}
                            className="dsp-gridline"
                            style={{ left: `${((t - axis.startMin) / (axis.endMin - axis.startMin)) * 100}%` }}
                            aria-hidden
                          />
                        ))}
                        {lane.blocks.map((b) => (
                          <Block key={b.id} block={b} window={axis} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dsp-agenda" aria-label={`Agenda for ${dayLabel}`}>
                  {openScheduled.length ? (
                    <AgendaLane name="Unassigned" meta={`${openScheduled.length} waiting`} blocks={openScheduled.map((u) => ({ ...u, startMin: u.startMin!, endMin: u.endMin! }))} unassigned />
                  ) : null}
                  {schedule.lanes.map((lane) => (
                    <AgendaLane
                      key={lane.technician.id}
                      name={lane.technician.name}
                      meta={lane.blocks.length ? `${hours(lane.bookedMin)} booked` : "Free all day"}
                      blocks={lane.blocks}
                    />
                  ))}
                </div>
              </section>
            )}

            <details className="dsp-section dsp-crew" open={!crew.length}>
              <summary className="dsp-h">Crew and skills · {crew.length}</summary>
              <p className="dsp-crew-help">
                Orvius sends each booking to someone with the right skill. Leave a technician without skills to let them take
                any job.
              </p>
              {crew.map((tech) => (
                <CrewMember key={`${tech.id}-${tech.skillsJson}-${tech.phone}`} tech={tech} trade={trade} onSaved={load} />
              ))}
              <AddTechnician onAdded={load} />
            </details>
          </>
        ) : null}
      </PlanUpgradeGate>
    </OsShell>
  );
}
