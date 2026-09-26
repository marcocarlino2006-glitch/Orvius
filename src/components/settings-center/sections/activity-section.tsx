"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScGroup, ScRow } from "../settings-primitives";

type Row = {
  id: string;
  at: string;
  action: string;
  actor: "orvius" | "owner" | "teammate" | "system";
  actorEmail: string | null;
  summary: string;
  entityType: string;
};

const TYPES = [
  ["", "Everything"],
  ["shop", "Settings and team"],
  ["call", "Calls"],
  ["lead", "Leads"],
  ["job", "Jobs"],
  ["customer", "Customers"],
  ["technician", "Technicians"],
  ["notification", "Alerts"],
  ["copilot", "Ask"],
] as const;

const ACTORS = [
  ["", "Anyone"],
  ["owner", "Owner"],
  ["teammate", "Teammates"],
  ["orvius", "Orvius"],
  ["system", "System"],
] as const;

const who = (r: Row) => r.actorEmail ?? (r.actor === "orvius" ? "Orvius" : r.actor === "system" ? "System" : r.actor === "owner" ? "Owner" : "Teammate");

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ActivitySection({ role }: { role: "owner" | "manager" | "dispatcher" | null }) {
  const [type, setType] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const params = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (type) p.set("type", type);
      if (actor) p.set("actor", actor);
      if (query) p.set("q", query);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [type, actor, query],
  );

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/audit?${params(after ? { cursor: after } : {})}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { rows: Row[]; nextCursor: string | null };
        if (mine !== seq.current) return;
        setRows((prev) => (after && prev ? [...prev, ...data.rows] : data.rows));
        setCursor(data.nextCursor);
      } catch {
        if (mine === seq.current) setError("Could not load the activity log.");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [params],
  );

  useEffect(() => {
    if (role === "dispatcher") return;
    void load(null);
  }, [load, role]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  if (role === "dispatcher") {
    return (
      <ScGroup>
        <ScRow label="Activity log" hint="Owners and managers can see who changed what. Ask the shop owner for access." />
      </ScGroup>
    );
  }

  return (
    <>
      <ScGroup>
        <ScRow label="Every decision and change" hint="What Orvius did on each call, and what each person changed, with who and when.">
          <a className="sc-btn" href={`/api/audit?${params({ format: "csv" })}`} download>
            Download CSV
          </a>
        </ScRow>
      </ScGroup>
      <div className="sc-log-filters" role="search">
        <input
          className="sc-input"
          type="search"
          placeholder="Search activity"
          aria-label="Search activity"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="sc-input sc-input--select" aria-label="What changed" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select className="sc-input sc-input--select" aria-label="Who" value={actor} onChange={(e) => setActor(e.target.value)}>
          {ACTORS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ScGroup>
        {rows === null ? (
          <p className="sc-muted sc-pad">{error ?? "Loading…"}</p>
        ) : rows.length === 0 ? (
          <ScRow label="Nothing here yet" hint={query || type || actor ? "No activity matches these filters." : "Activity appears as calls come in and settings change."} />
        ) : (
          <ol className="sc-log" aria-busy={loading}>
            {rows.map((r) => (
              <li key={r.id} className="sc-log-row">
                <time className="sc-log-when" dateTime={r.at}>
                  {when(r.at)}
                </time>
                <div className="sc-log-body">
                  <p className="sc-log-summary">{r.summary}</p>
                  <p className="sc-log-meta">
                    {who(r)} · <code>{r.action}</code>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </ScGroup>
      {error && rows ? <p className="sc-banner sc-banner--error">{error}</p> : null}
      {cursor ? (
        <div className="sc-actions">
          <button type="button" className="sc-btn" disabled={loading} onClick={() => void load(cursor)}>
            {loading ? "Loading…" : "Show older"}
          </button>
        </div>
      ) : null}
    </>
  );
}
