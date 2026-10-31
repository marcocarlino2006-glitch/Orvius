"use client";

import { useEffect, useState } from "react";

type Row = { event: string; label: string; people: number; fromPrevious: number | null };
type Window = { ready: boolean; days: number; rows: Row[] };
type Emails = { recovery: number; welcome: number; firstCall: number; failed: number; stopped: number } | null;
type Funnel = { week: Window; month: Window; emails: Emails };

/** Pricing page to paid shop, step by step, and the emails that pull people back in. */
export function SignupFunnelCard() {
  const [data, setData] = useState<Funnel | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<"week" | "month">("week");

  useEffect(() => {
    fetch("/api/admin/funnel")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: Funnel) => setData(json))
      .catch(() => setFailed(true));
  }, []);

  const view = data?.[range];
  return (
    <section className="card mb-8 p-6" aria-label="Sign-up funnel">
      <p className="home-os-kicker">Growth</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">Where do people stop?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        People at each step from pricing to paid. Counted without cookies; visitors before sign-in are a new person each day.
      </p>
      {failed ? (
        <p className="mt-4 font-sans text-sm text-ash">The funnel didn&apos;t load. Try again in a moment.</p>
      ) : !data || !view ? (
        <p className="mt-4 font-sans text-sm text-ash">Loading…</p>
      ) : !view.ready ? (
        <p className="mt-4 font-sans text-sm text-ash">The funnel table isn&apos;t on this database yet.</p>
      ) : (
        <>
          <div className="mt-4 flex gap-2 font-sans text-xs" role="group" aria-label="Range">
            {(["week", "month"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={`rounded-md border px-2.5 py-1 ${range === r ? "border-void text-void" : "border-rule text-ash"}`}
              >
                Last {r === "week" ? "7" : "30"} days
              </button>
            ))}
          </div>
          <table className="mt-4 w-full font-sans text-sm">
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.event} className="border-b border-rule">
                  <td className="py-2 text-void">{row.label}</td>
                  <td className="py-2 text-right tabular-nums text-void">{row.people}</td>
                  <td className="w-20 py-2 text-right tabular-nums text-ash">{row.fromPrevious === null ? "" : `${row.fromPrevious}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.emails ? (
            <p className="mt-4 font-sans text-xs text-ash">
              Last 30 days: {data.emails.recovery} setup reminders, {data.emails.welcome} welcomes, {data.emails.firstCall} first-call
              emails sent{data.emails.failed ? `, ${data.emails.failed} failed` : ""}
              {data.emails.stopped ? `, ${data.emails.stopped} owners stopped them` : ""}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
