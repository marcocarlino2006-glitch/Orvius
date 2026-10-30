"use client";

import { useEffect, useState } from "react";
import type { Scorecard, ScoreWeek } from "@/lib/receptionist-scorecard";

const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
const seconds = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`);

const ROWS: Array<{ label: string; value: (w: ScoreWeek) => string; detail: (w: ScoreWeek) => string }> = [
  { label: "Answered", value: (w) => share(w.answered, w.calls), detail: (w) => `${w.answered} of ${w.calls} calls` },
  { label: "Booked when bookable", value: (w) => share(w.booked, w.bookable), detail: (w) => `${w.booked} of ${w.bookable}` },
  { label: "Nothing to listen to", value: (w) => share(w.clean, w.graded), detail: (w) => `${w.clean} of ${w.graded} answered` },
  { label: "Slowest replies (p90)", value: (w) => seconds(w.replyP90Ms), detail: () => "median per call" },
  { label: "Passed to a person", value: (w) => share(w.transferred, w.calls), detail: (w) => `${w.transferred} calls` },
];

/** Orvius's own proof numbers across every real shop, this week against last. */
export function ReceptionistScorecardCard() {
  const [card, setCard] = useState<Scorecard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/receptionist-scorecard")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setCard)
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="card mb-8 p-6" aria-label="Receptionist scorecard">
      <p className="home-os-kicker">Calls</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">How good was the receptionist this week?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        Every real shop&apos;s phone calls, the last seven days against the seven before. A drop is emailed to the founders the day it shows.
      </p>
      {failed ? (
        <p className="mt-4 font-sans text-sm text-ash">The scorecard didn&apos;t load. Try again in a moment.</p>
      ) : !card ? (
        <p className="mt-4 font-sans text-sm text-ash">Loading…</p>
      ) : (
        <>
          {card.drops.length ? (
            <ul className="mt-4 space-y-1 font-sans text-sm text-flare" role="alert">
              {card.drops.map((drop) => (
                <li key={drop}>{drop}</li>
              ))}
            </ul>
          ) : null}
          <table className="mt-4 w-full font-sans text-sm">
            <thead>
              <tr className="text-left text-xs text-ash">
                <th className="py-1.5 font-normal" scope="col"></th>
                <th className="py-1.5 font-normal" scope="col">This week</th>
                <th className="py-1.5 font-normal" scope="col">Last week</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-rule">
                  <th className="py-2 pr-3 text-left font-normal text-void" scope="row">{row.label}</th>
                  <td className="py-2 pr-3 text-void">
                    <span className="font-medium">{row.value(card.thisWeek)}</span> <span className="text-xs text-ash">{row.detail(card.thisWeek)}</span>
                  </td>
                  <td className="py-2 text-ash">{row.value(card.lastWeek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
