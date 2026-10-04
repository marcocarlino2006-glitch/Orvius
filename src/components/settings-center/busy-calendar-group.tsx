"use client";

import { useState } from "react";
import type { BusyCalendar } from "./settings-model";
import { ScGroup, ScRow } from "./settings-primitives";

export function BusyCalendarGroup({ value, onChange }: { value: BusyCalendar; onChange: (next: BusyCalendar) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/busy-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ error: true, text: data.error ?? "Could not read that calendar." });
        return;
      }
      setUrl("");
      onChange({ source: data.source, syncedAt: data.syncedAt, error: null });
      setMessage({
        error: false,
        text:
          data.busyBlocks > 0
            ? `Found ${data.busyBlocks === 1 ? "1 busy time" : `${data.busyBlocks} busy times`} in the next two weeks. Callers won't be offered ${data.busyBlocks === 1 ? "it" : "those"}.`
            : "Nothing busy in the next two weeks. Anything you add there blocks booking within 10 minutes.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/busy-calendar", { method: "DELETE" });
      if (res.ok) {
        onChange(null);
        setMessage(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScGroup title="Busy times">
      {value ? (
        <ScRow
          label={`${value.source ?? "Calendar"} connected`}
          hint={
            value.error
              ? `Last check failed: ${value.error} Callers are offered times from the last good copy.`
              : "Times you're busy there are never offered to callers. Checked every 10 minutes while calls come in."
          }
        >
          <button type="button" className="sc-btn" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        </ScRow>
      ) : (
        <ScRow
          stack
          label="Block times you're busy"
          hint="Paste your calendar's secret iCal address. Google: Settings → your calendar → Integrate calendar → Secret address in iCal format. Apple and Outlook share links work too."
        >
          <div className="sc-inline-field">
            <input
              className="sc-input"
              aria-label="Calendar iCal address"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={url}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="sc-btn sc-btn--primary"
              disabled={busy || url.trim().length < 8}
              onClick={() => void connect()}
            >
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </ScRow>
      )}
      {message ? (
        <p className={message.error ? "sc-banner sc-banner--error" : "sc-banner"} role="status">
          {message.text}
        </p>
      ) : null}
    </ScGroup>
  );
}
