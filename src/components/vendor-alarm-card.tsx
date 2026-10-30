"use client";

import { useEffect, useState } from "react";

type Alarm = { vendor: string; operation: string; status: number; message: string; count: number; day: string; firstAt: string };

const VENDOR: Record<string, string> = { vapi: "Vapi", twilio: "Twilio", resend: "Resend" };

/** Providers refusing what Orvius sends them, last seven days. Empty is the goal. */
export function VendorAlarmCard() {
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/vendor-alarms")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { alarms: Alarm[] }) => setAlarms(data.alarms))
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="card mb-8 p-6" aria-label="Provider alarms">
      <p className="home-os-kicker">Providers</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">Is any provider refusing Orvius?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        Vapi, Twilio and Resend refusals from the last seven days. The first of each kind every day is emailed to the founders.
      </p>
      {failed ? (
        <p className="mt-4 font-sans text-sm text-ash">The alarms didn&apos;t load. Try again in a moment.</p>
      ) : alarms === null ? (
        <p className="mt-4 font-sans text-sm text-ash">Loading…</p>
      ) : alarms.length === 0 ? (
        <p className="mt-4 font-sans text-sm text-live">No refusals in seven days.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {alarms.map((alarm) => (
            <li key={`${alarm.day}-${alarm.vendor}-${alarm.firstAt}`} className="rounded-md border border-rule px-3 py-2.5 font-sans text-sm">
              <p className="text-flare">
                {VENDOR[alarm.vendor] ?? alarm.vendor} refused {alarm.operation} · HTTP {alarm.status} · {alarm.count}× on {alarm.day}
              </p>
              <p className="mt-1 break-words text-xs text-ash">{alarm.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
