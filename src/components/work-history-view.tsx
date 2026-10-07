"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HistoryEvent, HistoryWho } from "@/lib/work-history";
import { formatWhen } from "@/lib/when";

const WHO_FILTERS: Array<{ id: "all" | HistoryWho; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "orvius", label: "Orvius" },
  { id: "person", label: "People" },
  { id: "technician", label: "Technician" },
  { id: "customer", label: "Customer" },
];

/** Everything that happened to one piece of work, filterable by who did it. */
export function WorkHistory({ events, compact = false, timezone }: { events: HistoryEvent[]; compact?: boolean; timezone?: string | null }) {
  const [who, setWho] = useState<"all" | HistoryWho>("all");
  const shown = useMemo(() => (who === "all" ? events : events.filter((e) => e.who === who)), [events, who]);
  const counts = useMemo(() => Object.fromEntries(WHO_FILTERS.map((f) => [f.id, f.id === "all" ? events.length : events.filter((e) => e.who === f.id).length])), [events]);
  return (
    <section className={`wh${compact ? " wh--compact" : ""}`} aria-label="History">
      <div className="wh-head">
        {compact ? null : <h3 className="wh-title">History</h3>}
        <div className="wh-filters" role="tablist" aria-label="Who did it">
          {WHO_FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={who === f.id} className={`wh-filter${who === f.id ? " is-on" : ""}`} onClick={() => setWho(f.id)}>
              {f.label}
              <span>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <ol className="wh-list">
          {shown.map((e) => (
            <li key={e.id} className={`wh-event wh-event--${e.tone}`}>
              <span className={`wh-who wh-who--${e.who}`}>{e.whoLabel}</span>
              <div className="wh-body">
                <p className="wh-event-title">
                  {e.href ? <Link href={e.href}>{e.title}</Link> : e.title}
                  {e.simulated ? <em className="wh-sim"> · simulated</em> : null}
                </p>
                {e.detail ? <p className="wh-event-detail">{e.detail}</p> : null}
              </div>
              <time className="wh-at" dateTime={e.at}>
                {formatWhen(e.at, undefined, timezone)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cmd-empty">{events.length ? "Nothing from them on this work." : "Nothing recorded yet."}</p>
      )}
    </section>
  );
}


/** History fetched on demand, for a card in a list. */
export function WorkHistoryLoader({ kind, id }: { kind: "request" | "job"; id: string }) {
  const [data, setData] = useState<{ history: HistoryEvent[]; timezone?: string | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`/api/work/item?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then(async (res) => (res.ok ? setData((await res.json()) as { history: HistoryEvent[]; timezone?: string | null }) : setError(true)))
      .catch(() => setError(true));
  }, [kind, id]);
  if (error) return <p className="cb-error">History could not load.</p>;
  if (!data) return <p className="cb-muted">Reading the history…</p>;
  return <WorkHistory events={data.history} timezone={data.timezone} compact />;
}
