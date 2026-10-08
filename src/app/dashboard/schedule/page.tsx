"use client";

import { RecordLink } from "@/components/record-drawer";
import { ProLead } from "@/components/pro-lead";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { AssignTechButton } from "@/components/assign-tech-button";
import type { DispatchSchedule, ScheduleBlock, UnassignedItem } from "@/lib/dispatch-schedule";
import { industryTerms } from "@/lib/industry-terms";
import { toast } from "@/components/toaster";
import type { TechTimeOff } from "@/components/tech-schedule-editor";
import { previewMove, type MovePreview } from "@/lib/schedule-move";
import { DispatchWeek } from "@/components/dispatch-week";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Tech = {
  id: string;
  name: string;
  phone: string | null;
  skillsJson?: string;
  hoursJson?: string;
  timeOff?: TechTimeOff[];
  hasAppLink?: boolean;
  appLinkAt?: string | null;
};

type Board = {
  business: { id: string; name: string };
  day: string;
  /** The shop's current day, which can differ from the browser's. */
  today: string;
  timezone?: string;
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

const label = (skill: string) => skill.replace(/_/g, " ");

type Drag = { jobId: string; fromLane: string | null };

function Block({
  block,
  window,
  unassigned,
  lane = null,
  onDrag,
}: {
  block: Pick<ScheduleBlock, "id" | "title" | "startMin" | "endMin" | "urgency" | "customerName"> & {
    conflict?: string | null;
    status?: string;
  };
  window: { startMin: number; endMin: number };
  unassigned?: boolean;
  lane?: string | null;
  onDrag?: (drag: Drag | null) => void;
}) {
  const movable = Boolean(onDrag) && block.status !== "completed" && block.status !== "cancelled";
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
      onDragStart={
        movable
          ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", block.id);
              onDrag?.({ jobId: block.id, fromLane: lane });
            }
          : undefined
      }
      onDragEnd={movable ? () => onDrag?.(null) : undefined}
    >
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

export default function DispatchPage() {
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"day" | "week">("day");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(picked ? `/api/dispatch?day=${picked}` : "/api/dispatch")
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "The schedule didn't load. Nothing changed; try again.");
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

  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [pending, setPending] = useState<MovePreview | null>(null);
  const [moving, setMoving] = useState(false);

  async function reassign(jobId: string, technicianId: string | null, name: string, undoTo?: string | null) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json().catch(() => ({}))) as { techSms?: { sent: boolean } };
      toast({
        title: !technicianId
          ? "Moved to unassigned"
          : data.techSms?.sent
            ? `Moved to ${name} — they got a text`
            : `Moved to ${name} — no text went out, tell them yourself`,
        ...(undoTo !== undefined
          ? {
              action: {
                label: "Undo",
                run: () =>
                  reassign(jobId, undoTo, crew.find((t) => t.id === undoTo)?.name ?? "Unassigned"),
              },
            }
          : {}),
      });
    } catch {
      toast({ title: "That move didn't save. Try again.", tone: "error" });
    }
    load();
  }

  /* The time stays put: dropping on a row changes who goes, not when. */
  const dropTarget = (laneId: string | null, name: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!drag || drag.fromLane === laneId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropLane !== (laneId ?? "")) setDropLane(laneId ?? "");
    },
    onDragLeave: () => setDropLane(null),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDropLane(null);
      const current = drag;
      setDrag(null);
      if (!current || current.fromLane === laneId || !board?.schedule) return;
      const preview = previewMove(board.schedule, current.jobId, laneId);
      if (preview) setPending(preview);
      else void reassign(current.jobId, laneId, name, current.fromLane);
    },
  });

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
  const terms = industryTerms(board?.trade);
  const decisions = schedule?.unassigned.length ?? 0;
  const conflicts = schedule?.conflicts ?? [];
  const bookedMin = schedule?.lanes.reduce((sum, lane) => sum + lane.bookedMin, 0) ?? 0;

  return (
    <OsShell title="Schedule" subtitle="Can we actually do this work?">
      <PlanUpgradeGate module="dispatch">
        {view === "day" ? (
        <ProLead
          loading={loading && !board}
          figure={String(board?.jobCount ?? 0)}
          caption={day === today ? `${terms.Jobs} today` : `${terms.Jobs} this day`}
          facts={[
            { label: "Booked", value: hours(bookedMin) },
            { label: "Unassigned", value: decisions, live: decisions > 0 },
            { label: "Conflicts", value: conflicts.length, live: conflicts.length > 0 },
          ]}
        />
        ) : null}

        <div className="dsp-toolbar">
          <div className="dwk-mode" role="radiogroup" aria-label="Schedule view">
            {(["day", "week"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "is-on" : undefined} onClick={() => setView(v)}>
                {v === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
          {view === "day" ? (
          <>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="Previous day">
            ←
          </button>
          <label className="dsp-day">
            <span className="dsp-day-label">
              {day === today ? <span className="dsp-day-today">Today</span> : null}
              {dayLabel}
            </span>
            <input
              type="date"
              className="dsp-date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              aria-label="Day"
            />
          </label>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setDay((d) => shiftDay(d, 1))} aria-label="Next day">
            →
          </button>
          {day !== today ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setPicked(null)}>
              Today
            </button>
          ) : null}
          </>
          ) : null}
          {loading && board && view === "day" ? <span className="dsp-refreshing">Refreshing…</span> : null}
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
            {view === "week" ? (
              <DispatchWeek
                anchor={day}
                onOpenDay={(d) => {
                  setPicked(d);
                  setView("day");
                }}
              />
            ) : (
            <>
            {pending ? (
              <section className="dsp-section dsp-preview" aria-labelledby="dsp-preview" role="dialog">
                <h2 id="dsp-preview" className="dsp-h">
                  Move {pending.title} from {pending.fromName} to {pending.toName}?
                </h2>
                {pending.conflicts.length ? (
                  <ul className="dsp-preview-warn">
                    {pending.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="dsp-preview-ok">No overlaps or time off on {pending.toName === "Unassigned" ? "the open row" : `${pending.toName.split(" ")[0]}'s day`}.</p>
                )}
                <ul className="dsp-preview-notify">
                  {pending.notify.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <div className="dsp-preview-act">
                  <button
                    type="button"
                    className="ox-btn ox-btn--primary ox-btn--sm"
                    disabled={moving}
                    onClick={() => {
                      const move = pending;
                      setMoving(true);
                      void reassign(move.jobId, move.toTechId, move.toName, move.fromTechId).finally(() => {
                        setMoving(false);
                        setPending(null);
                      });
                    }}
                  >
                    {moving ? "Moving…" : pending.conflicts.length ? "Move it anyway" : "Move it"}
                  </button>
                  <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={moving} onClick={() => setPending(null)}>
                    Keep it where it is
                  </button>
                </div>
              </section>
            ) : null}

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
                body={`Calls Orvius books land here with a ${terms.worker} already picked. Pick another day, or book one yourself.`}
                action={
                  <Link href="/dashboard/jobs/new" className="ox-btn ox-btn--quiet ox-btn--sm">
                    New {terms.job}
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
                      <div className={`dsp-track ${dropLane === "" ? "is-drop" : ""}`} {...dropTarget(null, "Unassigned")}>
                        {openScheduled.map((u) => (
                          <Block
                            key={u.id}
                            block={{ ...u, startMin: u.startMin!, endMin: u.endMin! }}
                            window={axis}
                            unassigned
                            onDrag={setDrag}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {schedule.lanes.map((lane) => (
                    <div key={lane.technician.id} className={`dsp-lane${lane.offAllDay ? " is-off" : ""}`} role="row">
                      <div className="dsp-lane-name">
                        <span className="dsp-lane-tech">{lane.technician.name}</span>
                        {lane.availability ? <span className="dsp-lane-off">{lane.availability}</span> : null}
                        <span className="dsp-lane-meta">
                          {lane.blocks.length ? `${hours(lane.bookedMin)} booked` : lane.offAllDay ? "Nothing booked" : "Free all day"}
                          {lane.technician.skills.length ? ` · ${lane.technician.skills.map(label).join(", ")}` : ""}
                        </span>
                      </div>
                      <div
                        className={`dsp-track ${dropLane === lane.technician.id ? "is-drop" : ""}`}
                        {...dropTarget(lane.technician.id, lane.technician.name)}
                      >
                        {ticks.map((t) => (
                          <span
                            key={t}
                            className="dsp-gridline"
                            style={{ left: `${((t - axis.startMin) / (axis.endMin - axis.startMin)) * 100}%` }}
                            aria-hidden
                          />
                        ))}
                        {lane.blocks.map((b) => (
                          <Block key={b.id} block={b} window={axis} lane={lane.technician.id} onDrag={setDrag} />
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
                      meta={[lane.availability, lane.blocks.length ? `${hours(lane.bookedMin)} booked` : lane.offAllDay ? null : "Free all day"]
                        .filter(Boolean)
                        .join(" · ")}
                      blocks={lane.blocks}
                    />
                  ))}
                </div>
              </section>
            )}
            </>
            )}

            <section className="dsp-section dsp-crew-link">
              <p className="dsp-crew-help">
                {crew.length
                  ? `${crew.length} on the crew. Skills, working hours, time off and phones live in Team.`
                  : "Nobody is on the crew yet, so Orvius can't assign work. Add people in Team."}
              </p>
              <Link href="/dashboard/team" className="ox-btn ox-btn--quiet ox-btn--sm">
                {crew.length ? "Open Team" : "Add your crew"}
              </Link>
            </section>
          </>
        ) : null}
      </PlanUpgradeGate>
    </OsShell>
  );
}
