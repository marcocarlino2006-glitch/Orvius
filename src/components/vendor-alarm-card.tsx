"use client";

import { useEffect, useState } from "react";

type Alarm = { vendor: string; operation: string; status: number; message: string; count: number; day: string; firstAt: string };

type SelfTest = { day: string; status: string; error: string | null } | null;

type LineCheck = { day: string; status: string; error: string | null; shop: string | null; replyP90Ms: number | null } | null;

function lineCheckLine(check: NonNullable<LineCheck>): string {
  const shop = check.shop ? ` to ${check.shop}` : "";
  if (check.status === "passed") {
    const reply = check.replyP90Ms ? ` Slowest reply ${(check.replyP90Ms / 1000).toFixed(1)}s.` : "";
    return `Daily test call${shop}, ${check.day}: the receptionist answered and replied.${reply}`;
  }
  if (check.status === "failed") return `Daily test call${shop}, ${check.day}: failed. ${check.error ?? ""}`;
  if (check.status === "calling") return `Daily test call${shop}, ${check.day}: on the line now.`;
  return `Daily test call, ${check.day}: ${check.error ?? check.status}`;
}

const VENDOR: Record<string, string> = { vapi: "Vapi", twilio: "Twilio", resend: "Resend" };

/** Providers refusing what Orvius sends them, last seven days. Empty is the goal. */
export function VendorAlarmCard() {
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTest>(null);
  const [lineCheck, setLineCheck] = useState<LineCheck>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/vendor-alarms")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { alarms: Alarm[]; selfTest: SelfTest; lineCheck: LineCheck }) => {
        setAlarms(data.alarms);
        setSelfTest(data.selfTest);
        setLineCheck(data.lineCheck);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="card mb-8 p-6" aria-label="Provider alarms">
      <p className="home-os-kicker">Providers</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">Is any provider refusing Orvius?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        Vapi, Twilio and Resend refusals from the last seven days. The first of each kind every day is emailed to the founders.
      </p>
      {lineCheck ? (
        <p className={`mt-4 font-sans text-sm ${lineCheck.status === "failed" ? "text-flare" : "text-void"}`}>{lineCheckLine(lineCheck)}</p>
      ) : null}
      {selfTest ? (
        <p className={`mt-4 font-sans text-sm ${selfTest.status === "failed" ? "text-flare" : "text-void"}`}>
          Daily receptionist save test, {selfTest.day}:{" "}
          {selfTest.status === "passed" ? "Vapi accepted it." : selfTest.status === "failed" ? `refused. ${selfTest.error ?? ""}` : selfTest.status}
        </p>
      ) : null}
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
