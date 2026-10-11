"use client";

import { useState } from "react";
import { LINE_RETENTION_DAYS } from "@/lib/usage-limits";
import { PAUSE_ENDING_NOTICE_DAYS, PAUSE_MONTH_OPTIONS, pauseDate, pauseWindow, type KeepRow, type PauseMonths } from "@/lib/plan-exit";

type ExitData = {
  headline: string;
  rows: KeepRow[];
  windowDays: number;
  periodEnd: string | null;
  interval: "month" | "year";
  cancelScheduled: boolean;
  pause: { available: boolean; blocker: string | null };
  smallerPlan: { id: string; name: string; price: number; includedCalls: number } | null;
};

export type PlanPause = { startsAt: string | null; until: string; started: boolean };

async function openPortal(flow: "cancel" | "switch") {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flow }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Stripe didn't open. Nothing was changed. Try again.");
  window.location.href = data.url;
}

/** Paused, or about to be: when it ends, and the way back on. */
export function PausedPlanNote({ pause, onChanged }: { pause: PlanPause; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/pause", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Stripe didn't resume the plan. Nothing was changed. Try again.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe didn't resume the plan. Nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plan-paused font-sans" role="status">
      <div className="plan-paused-copy">
        <p className="plan-paused-title">
          {pause.started ? `Paused until ${pauseDate(pause.until)}` : `Pause starts ${pauseDate(pause.startsAt)}`}
        </p>
        <p className="plan-paused-detail">
          {pause.started
            ? `No charge until then. Your line is off and callers hear a short message to reach you directly. Your number, customers and settings are kept. It all switches back on by itself on ${pauseDate(pause.until)}.`
            : `Your paid month runs to ${pauseDate(pause.startsAt)}. After that there's no charge and the line is off until ${pauseDate(pause.until)}. We'll text you ${PAUSE_ENDING_NOTICE_DAYS} days before it switches back on.`}
        </p>
        {pause.started ? <p className="plan-paused-detail">Resuming now starts a new paid month today.</p> : null}
        {error ? <p className="plan-exit-error" role="alert">{error}</p> : null}
      </div>
      <button type="button" className="sc-btn sc-btn--primary" disabled={busy} onClick={() => void resume()}>
        {busy ? "Working…" : pause.started ? "Resume now" : "Call off the pause"}
      </button>
    </div>
  );
}

/**
 * Pause or cancel. It opens on what Orvius did for the shop, then the ways to
 * stay for less (pause for the slow season, a smaller plan), then cancel.
 * Cancelling is never hidden or made harder than a pause.
 */
export function PlanExitPanel({ planName, onChanged }: { planName: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExitData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [months, setMonths] = useState<PauseMonths>(2);
  const [busy, setBusy] = useState<"pause" | "switch" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (data) return;
    setLoadError(null);
    try {
      const res = await fetch("/api/billing/exit");
      if (!res.ok) throw new Error();
      setData((await res.json()) as ExitData);
    } catch {
      setLoadError("Couldn't load your plan details. You can still cancel on Stripe below.");
    }
  }

  async function pause() {
    setBusy("pause");
    setError(null);
    try {
      const res = await fetch("/api/billing/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Stripe didn't pause the plan. Nothing was changed. Try again.");
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe didn't pause the plan. Nothing was changed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function portal(flow: "cancel" | "switch") {
    setBusy(flow);
    setError(null);
    try {
      await openPortal(flow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe didn't open. Nothing was changed. Try again.");
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button type="button" className="plan-exit-open font-sans" onClick={() => void load()}>
        Pause or cancel
      </button>
    );
  }

  const window_ = data?.periodEnd ? pauseWindow(new Date(data.periodEnd), months) : null;

  return (
    <section className="plan-exit font-sans" aria-label="Pause or cancel">
      <div className="plan-exit-head">
        <h3 className="plan-exit-title">Before you decide</h3>
        <button type="button" className="plan-exit-close" onClick={() => setOpen(false)}>
          Keep my plan
        </button>
      </div>

      {data ? (
        <>
          <p className="plan-exit-lead">{data.headline}</p>
          <dl className="plan-exit-stats" aria-label={`Last ${data.windowDays} days`}>
            {data.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : loadError ? (
        <p className="plan-exit-lead">{loadError}</p>
      ) : (
        <p className="plan-exit-lead" aria-busy="true">Loading your last 90 days…</p>
      )}

      <div className="plan-exit-options">
        <div className="plan-exit-option">
          <p className="plan-exit-option-title">Pause for the slow season</p>
          {data?.pause.available && window_ ? (
            <>
              <p className="plan-exit-option-body">
                No charge while paused. Your number, customers and settings stay. Your paid month runs to{" "}
                {pauseDate(window_.startsAt)}; after that the line is off and callers hear a short message to reach you
                directly, so switch off call forwarding to Orvius for those months. It switches back on by itself.
              </p>
              <div className="plan-exit-months" role="radiogroup" aria-label="How long">
                {PAUSE_MONTH_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={months === m}
                    className={months === m ? "is-on" : undefined}
                    onClick={() => setMonths(m)}
                  >
                    {m} month{m === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
              <button type="button" className="sc-btn sc-btn--primary" disabled={busy !== null} onClick={() => void pause()}>
                {busy === "pause" ? "Pausing…" : `Pause until ${pauseDate(window_.until)}`}
              </button>
            </>
          ) : (
            <p className="plan-exit-option-body">{data?.pause.blocker ?? "Pausing isn't available for this plan right now."}</p>
          )}
        </div>

        {data?.smallerPlan ? (
          <div className="plan-exit-option">
            <p className="plan-exit-option-title">Switch to {data.smallerPlan.name}</p>
            <p className="plan-exit-option-body">
              ${data.smallerPlan.price}/mo with {data.smallerPlan.includedCalls.toLocaleString("en-US")} answered calls
              included, instead of {planName}. Every call is still answered past that.
            </p>
            <button type="button" className="sc-btn" disabled={busy !== null} onClick={() => void portal("switch")}>
              {busy === "switch" ? "Opening Stripe…" : `Switch to ${data.smallerPlan.name}`}
            </button>
          </div>
        ) : null}

        <div className="plan-exit-option">
          <p className="plan-exit-option-title">Cancel</p>
          <p className="plan-exit-option-body">
            You cancel on Stripe. The line stops answering when the plan ends, and your number is held {LINE_RETENTION_DAYS}{" "}
            days in case you come back. Your records stay readable, and you can download them any time.
          </p>
          <div className="plan-exit-row">
            <button type="button" className="sc-btn" disabled={busy !== null} onClick={() => void portal("cancel")}>
              {busy === "cancel" ? "Opening Stripe…" : "Continue to cancel"}
            </button>
            <a href="/api/account/export" download className="plan-exit-link">
              Download my data
            </a>
          </div>
        </div>
      </div>

      {error ? <p className="plan-exit-error" role="alert">{error}</p> : null}
    </section>
  );
}
