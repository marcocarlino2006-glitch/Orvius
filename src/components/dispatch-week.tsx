"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/toaster";
import type { DispatchSchedule, ScheduleBlock } from "@/lib/dispatch-schedule";

type WeekDay = { day: string; schedule: DispatchSchedule };
type Week = { days: WeekDay[]; today: string; timezone: string; crew: { id: string; name: string }[] };
type Chip = ScheduleBlock & { unassigned?: boolean };
type Drag = { jobId: string; title: string; fromLane: string | null; fromDay: string; startMin: number };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const clock = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};
const dayHead = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
};
const shift = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Seven days by technician. Dragging a job to another cell keeps its time of
 * day and changes the day, the person, or both; a cell where the technician is
 * off all day refuses the drop.
 */
export function DispatchWeek({ anchor, onOpenDay }: { anchor: string; onOpenDay: (day: string) => void }) {
  const [start, setStart] = useState(anchor);
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/dispatch?view=week&day=${start}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "The week did not load.");
        return res.json();
      })
      .then(setWeek)
      .catch((err) => setError(err.message));
  }, [start]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(d: Drag, laneId: string | null, laneName: string, day: string, undo = true) {
    try {
      const res = await fetch(`/api/jobs/${d.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: laneId, scheduledLocal: `${day}T${hhmm(d.startMin)}` }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json().catch(() => ({}))) as { techSms?: { sent: boolean } };
      const when = `${dayHead(day).weekday} ${clock(d.startMin)}`;
      toast({
        title: !laneId
          ? `${d.title} → unassigned, ${when}`
          : `${d.title} → ${laneName}, ${when}${laneId !== d.fromLane ? (data.techSms?.sent ? " — they got a text" : " — no text went out") : ""}`,
        ...(undo
          ? {
              action: {
                label: "Undo",
                run: () =>
                  move(
                    { ...d, fromLane: laneId, fromDay: day },
                    d.fromLane,
                    week?.crew.find((c) => c.id === d.fromLane)?.name ?? "Unassigned",
                    d.fromDay,
                    false,
                  ),
              },
            }
          : {}),
      });
    } catch {
      toast({ title: "That move didn't save. Try again.", tone: "error" });
    }
    load();
  }

  if (error) return <p className="dsp-decision-error" role="alert">{error}</p>;
  if (!week) return <p className="dwk-loading">Loading the week…</p>;

  const rows: { id: string | null; name: string }[] = [
    ...(week.days.some((d) => d.schedule.unassigned.some((u) => u.startMin != null)) ? [{ id: null, name: "Unassigned" }] : []),
    ...week.crew,
  ];
  const first = week.days[0]!.day;
  const last = week.days[6]!.day;
  const total = week.days.reduce((n, d) => n + d.schedule.lanes.reduce((m, l) => m + l.blocks.length, 0) + d.schedule.unassigned.length, 0);
  const conflicts = week.days.reduce((n, d) => n + d.schedule.conflicts.length, 0);

  return (
    <section className="dsp-section dwk" aria-label="Week schedule">
      <div className="dwk-bar">
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" aria-label="Previous week" onClick={() => setStart(shift(first, -7))}>
          ←
        </button>
        <p className="dwk-range">
          {dayHead(first).date} – {dayHead(last).date}
          <span className="dwk-range-meta">
            {total} {total === 1 ? "job" : "jobs"}
            {conflicts ? ` · ${conflicts} to sort out` : ""}
          </span>
        </p>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" aria-label="Next week" onClick={() => setStart(shift(first, 7))}>
          →
        </button>
        {week.today < first || week.today > last ? (
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setStart(week.today)}>
            This week
          </button>
        ) : null}
      </div>

      <div className="dwk-grid" role="table" aria-label={`Week of ${dayHead(first).date}`}>
        <div className="dwk-row dwk-head" role="row">
          <span className="dwk-name" role="columnheader" />
          {week.days.map(({ day, schedule }) => {
            const h = dayHead(day);
            const n = schedule.lanes.reduce((m, l) => m + l.blocks.length, 0) + schedule.unassigned.filter((u) => u.startMin != null).length;
            return (
              <button
                key={day}
                type="button"
                role="columnheader"
                className={`dwk-day${day === week.today ? " is-today" : ""}`}
                onClick={() => onOpenDay(day)}
                title="Open this day"
              >
                <span className="dwk-day-name">{h.weekday}</span>
                <span className="dwk-day-date">{h.date}</span>
                <span className="dwk-day-count">{n ? `${n} ${n === 1 ? "job" : "jobs"}` : "—"}</span>
              </button>
            );
          })}
        </div>

        {rows.map((row) => (
          <div key={row.id ?? "unassigned"} className="dwk-row" role="row">
            <span className="dwk-name" role="rowheader">
              {row.name}
            </span>
            {week.days.map(({ day, schedule }) => {
              const lane = row.id ? schedule.lanes.find((l) => l.technician.id === row.id) : null;
              const chips: Chip[] = row.id
                ? (lane?.blocks ?? [])
                : schedule.unassigned
                    .filter((u) => u.startMin != null)
                    .map((u) => ({
                      id: u.id,
                      title: u.title,
                      status: "scheduled",
                      urgency: u.urgency,
                      customerName: u.customerName,
                      address: u.address,
                      startMin: u.startMin!,
                      endMin: u.endMin!,
                      skill: u.skill,
                      conflict: null,
                      unassigned: true,
                    }));
              const key = `${row.id ?? ""}|${day}`;
              const closed = Boolean(lane?.offAllDay);
              const canDrop = Boolean(drag) && !(drag!.fromLane === row.id && drag!.fromDay === day);
              return (
                <div
                  key={day}
                  role="cell"
                  className={`dwk-cell${closed ? " is-off" : ""}${over === key ? (closed ? " is-refuse" : " is-drop") : ""}${day === week.today ? " is-today" : ""}`}
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = closed ? "none" : "move";
                    if (over !== key) setOver(key);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const d = drag;
                    setDrag(null);
                    if (!d || !canDrop) return;
                    if (closed) {
                      toast({ title: `${row.name} is off that day. Pick someone else.`, tone: "error" });
                      return;
                    }
                    void move(d, row.id, row.name, day);
                  }}
                >
                  {lane?.availability ? <span className="dwk-off">{lane.availability.replace(/^Works /, "")}</span> : null}
                  {chips.map((c) => (
                    <Link
                      key={c.id}
                      href={`/dashboard/jobs/${c.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", c.id);
                        setDrag({ jobId: c.id, title: c.title, fromLane: row.id, fromDay: day, startMin: c.startMin });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      className={`dwk-chip${c.conflict ? " is-conflict" : ""}${c.urgency === "emergency" ? " is-urgent" : ""}${c.unassigned ? " is-unassigned" : ""}`}
                      title={c.conflict ?? `${c.title}${c.customerName ? ` · ${c.customerName}` : ""}`}
                    >
                      <span className="dwk-chip-time">{clock(c.startMin)}</span>
                      <span className="dwk-chip-title">{c.title}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="dwk-help">Drag a job to another day or person. It keeps its time. Click a day to open it.</p>
    </section>
  );
}
