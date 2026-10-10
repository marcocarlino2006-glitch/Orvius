"use client";

import { useState } from "react";
import {
  closureDayLabel,
  parseClosures,
  suggestedHolidays,
  upcomingClosures,
  type ShopClosure,
} from "@/lib/shop-closures";
import type { Business, PatchFn } from "./settings-model";
import { ScGroup, ScRow } from "./settings-primitives";

/**
 * Whole days off — holidays, a training day. The receptionist never offers a
 * time on one and tells callers the shop is closed; emergencies still alert.
 */
export function ClosedDaysGroup({ b, patch }: { b: Business; patch: PatchFn }) {
  const timezone = b.timezone ?? "America/New_York";
  const all = parseClosures(b.closedDatesJson);
  const upcoming = upcomingClosures(all, timezone);
  const suggestions = suggestedHolidays(all, timezone);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: ShopClosure[]) {
    setBusy(true);
    // Past days are dropped on every save, so the list never fills with last year.
    const kept = upcomingClosures(next, timezone);
    const ok = await patch({ closedDatesJson: JSON.stringify(kept) });
    setBusy(false);
    return ok;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    if (await save([...all, { date, label: label.trim() || "Closed" }])) {
      setDate("");
      setLabel("");
    }
  }

  return (
    <ScGroup title="Days closed">
      <ScRow
        stack
        label="Holidays and days off"
        hint="The receptionist won't offer a time on these days and tells callers you're closed. Emergencies still reach you right away."
      >
        {upcoming.length ? (
          <ul className="sc-closures" aria-label="Days closed">
            {upcoming.map((c) => (
              <li key={c.date} className="sc-closure">
                <span className="sc-closure-copy">
                  <span className="sc-closure-label">{c.label}</span>
                  <span className="sc-closure-date">{closureDayLabel(c.date)}</span>
                </span>
                <button
                  type="button"
                  className="sc-btn"
                  disabled={busy}
                  aria-label={`Remove ${c.label}, ${closureDayLabel(c.date)}`}
                  onClick={() => void save(all.filter((x) => x.date !== c.date))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sc-muted">No days closed coming up. You&apos;re open on your weekly hours.</p>
        )}
      </ScRow>
      {suggestions.length ? (
        <ScRow stack label="Add a holiday">
          <div className="sc-chips">
            {suggestions.map((h) => (
              <button
                key={h.date}
                type="button"
                className="sc-chip"
                disabled={busy}
                onClick={() => void save([...all, h])}
              >
                + {h.label} · {closureDayLabel(h.date).replace(/^\w+, /, "")}
              </button>
            ))}
          </div>
        </ScRow>
      ) : null}
      <ScRow stack label="Add another day">
        <form className="sc-inline-field" onSubmit={(e) => void add(e)}>
          <input
            type="date"
            className="sc-input sc-input--date"
            aria-label="Date closed"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="sc-input"
            aria-label="Reason"
            placeholder="Reason (optional)"
            maxLength={40}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" className="sc-btn sc-btn--primary" disabled={busy || !date}>
            {busy ? "Saving…" : "Add"}
          </button>
        </form>
      </ScRow>
    </ScGroup>
  );
}
