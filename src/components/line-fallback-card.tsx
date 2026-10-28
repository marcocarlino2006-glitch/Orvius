"use client";

import { useState } from "react";

type Line = { phone: string; shop: string | null; status: string; aiRoute: string };
type Report = { lines: Line[]; unprotected: number; notOnAccount: number; notVapi: number };

const LABEL: Record<string, string> = {
  ok: "Protected",
  fixed: "Fixed",
  missing: "No fallback",
  wrong: "Wrong fallback",
  not_on_account: "Not on this Twilio account",
};

/** Whether each shop line rings the owner, then takes a voicemail, if the AI is down. */
export function LineFallbackCard() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"check" | "fix" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "GET" | "POST") {
    setBusy(method === "GET" ? "check" : "fix");
    setError(null);
    try {
      const res = await fetch("/api/admin/line-fallback", { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't go through. Try again.");
      setReport(data as Report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mb-8 p-6" aria-label="Line fallback">
      <p className="home-os-kicker">Calls</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">If the AI is down, does each line ring the shop?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        Reads every shop line back from Twilio. A line with no fallback plays Twilio&apos;s error tone and the shop never learns about the call.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn btn-void text-xs" disabled={busy !== null} onClick={() => void run("GET")}>
          {busy === "check" ? "Checking…" : "Check lines"}
        </button>
        {report && report.unprotected > 0 ? (
          <button type="button" className="btn text-xs" disabled={busy !== null} onClick={() => void run("POST")}>
            {busy === "fix" ? "Fixing…" : `Fix ${report.unprotected} ${report.unprotected === 1 ? "line" : "lines"}`}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 text-xs text-flare" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="mt-4 font-sans text-sm">
          <p className={report.unprotected === 0 ? "text-live" : "text-flare"}>
            {report.unprotected === 0
              ? "Every line Twilio can see has the fallback."
              : `${report.unprotected} ${report.unprotected === 1 ? "line has" : "lines have"} no fallback.`}
            {report.notVapi > 0 ? ` ${report.notVapi} not routed to the AI.` : ""}
            {report.notOnAccount > 0 ? ` ${report.notOnAccount} not on this Twilio account.` : ""}
          </p>
          <ul className="mt-2 space-y-1">
            {report.lines.map((line) => (
              <li key={line.phone} className="text-xs text-void">
                {LABEL[line.status] ?? line.status} · {line.shop ?? "Unassigned"} · {line.phone} · AI route: {line.aiRoute}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
