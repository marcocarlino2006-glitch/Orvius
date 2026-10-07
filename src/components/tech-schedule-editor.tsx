"use client";

import { useState } from "react";
import { toast } from "@/components/toaster";
import { WEEKDAYS, parseHoursForm, weekdayLabel, type HoursForm } from "@/lib/shop-hours-form";

export type TechTimeOff = { id: string; startsAt: string; endsAt: string; reason: string | null };

type Affected = { id: string; title: string; scheduledAt: string | null };

const dayFmt = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });

/** Last day of an entry: endsAt is the midnight after it. */
const lastDay = (iso: string) => new Date(new Date(iso).getTime() - 60_000).toISOString();

function hasHours(json: string | undefined) {
  try {
    return Boolean(json && Object.keys(JSON.parse(json)).length);
  } catch {
    return false;
  }
}

/**
 * A technician's own hours and time off. Bookings, the receptionist's offered
 * times and dispatch recommendations all skip them outside these.
 */
export function TechScheduleEditor({
  tech,
  timezone,
  today,
  onChanged,
}: {
  tech: { id: string; name: string; hoursJson?: string; timeOff?: TechTimeOff[] };
  timezone: string;
  today: string;
  onChanged: () => void;
}) {
  const [own, setOwn] = useState(() => hasHours(tech.hoursJson));
  const [hours, setHours] = useState<HoursForm>(() => parseHoursForm(tech.hoursJson));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affected, setAffected] = useState<Affected[]>([]);
  const timeOff = tech.timeOff ?? [];

  async function send(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveHours(next: HoursForm | null) {
    const data = await send(`/api/technicians/${tech.id}`, { method: "PATCH", body: JSON.stringify({ hours: next }) });
    if (!data) return;
    toast({ title: next ? `${tech.name}'s hours saved` : `${tech.name} works the shop's hours` });
    onChanged();
  }

  async function addTimeOff() {
    const data = await send(`/api/technicians/${tech.id}/time-off`, {
      method: "POST",
      body: JSON.stringify({ from, to, reason: reason.trim() || undefined }),
    });
    if (!data) return;
    setAffected(data.affected ?? []);
    setReason("");
    toast({ title: `${tech.name} marked off` });
    onChanged();
  }

  async function removeTimeOff(entry: TechTimeOff) {
    const data = await send(`/api/technicians/${tech.id}/time-off?entry=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    if (!data) return;
    setAffected([]);
    onChanged();
  }

  const setDay = (day: (typeof WEEKDAYS)[number], patch: Partial<HoursForm[typeof day]>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));

  return (
    <details className="tse">
      <summary className="tse-summary">
        Hours and time off
        <span className="tse-summary-meta">
          {own ? "Own hours" : "Shop hours"}
          {timeOff.length ? ` · ${timeOff.length} time off` : ""}
        </span>
      </summary>

      <div className="tse-body">
        <div className="tse-block">
          <div className="tse-mode" role="radiogroup" aria-label={`${tech.name} hours`}>
            <button
              type="button"
              role="radio"
              aria-checked={!own}
              className={!own ? "is-on" : undefined}
              disabled={busy}
              onClick={() => {
                setOwn(false);
                if (hasHours(tech.hoursJson)) void saveHours(null);
              }}
            >
              Shop hours
            </button>
            <button type="button" role="radio" aria-checked={own} className={own ? "is-on" : undefined} disabled={busy} onClick={() => setOwn(true)}>
              Own hours
            </button>
          </div>
          {own ? (
            <>
              <div className="tse-days">
                {WEEKDAYS.map((day) => {
                  const d = hours[day];
                  return (
                    <div key={day} className={`tse-day${d.closed ? " is-off" : ""}`}>
                      <label className="tse-day-name">
                        <input type="checkbox" checked={!d.closed} onChange={(e) => setDay(day, { closed: !e.target.checked })} />
                        {weekdayLabel(day)}
                      </label>
                      {d.closed ? (
                        <span className="tse-day-off">Off</span>
                      ) : (
                        <span className="tse-day-times">
                          <input type="time" className="input" aria-label={`${weekdayLabel(day)} start`} value={d.open} onChange={(e) => setDay(day, { open: e.target.value })} />
                          <span aria-hidden>to</span>
                          <input type="time" className="input" aria-label={`${weekdayLabel(day)} end`} value={d.close} onChange={(e) => setDay(day, { close: e.target.value })} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void saveHours(hours)}>
                {busy ? "Saving…" : "Save hours"}
              </button>
            </>
          ) : (
            <p className="tse-note">Takes jobs whenever the shop is open.</p>
          )}
        </div>

        <div className="tse-block">
          <p className="tse-label">Time off</p>
          {timeOff.length ? (
            <ul className="tse-off-list">
              {timeOff.map((t) => {
                const first = dayFmt(t.startsAt, timezone);
                const last = dayFmt(lastDay(t.endsAt), timezone);
                return (
                  <li key={t.id}>
                    <span>
                      {first === last ? first : `${first} – ${last}`}
                      {t.reason ? ` · ${t.reason}` : ""}
                    </span>
                    <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void removeTimeOff(t)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tse-note">None coming up.</p>
          )}
          <div className="tse-add">
            <label>
              <span className="tse-field">First day</span>
              <input type="date" className="input" value={from} min={today} onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }} />
            </label>
            <label>
              <span className="tse-field">Last day</span>
              <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="tse-reason">
              <span className="tse-field">Reason (optional)</span>
              <input className="input" value={reason} maxLength={60} placeholder="Vacation" onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy || !from || !to} onClick={() => void addTimeOff()}>
              {busy ? "Saving…" : "Mark off"}
            </button>
          </div>
          {affected.length ? (
            <div className="tse-affected" role="alert">
              <p>
                {affected.length === 1 ? "1 job is" : `${affected.length} jobs are`} already booked on {tech.name} then and needs someone else:
              </p>
              <ul>
                {affected.map((j) => (
                  <li key={j.id}>
                    <a href={`/dashboard/jobs/${j.id}`}>
                      {j.title}
                      {j.scheduledAt ? ` · ${dayFmt(j.scheduledAt, timezone)}` : ""}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {error ? <p className="dsp-decision-error" role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
