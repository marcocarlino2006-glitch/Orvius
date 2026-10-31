"use client";

import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  action: string;
  actorKind: string;
  actorEmail: string | null;
  summary: string;
  createdAt: string;
};

function who(event: AuditEvent): string {
  if (event.actorKind === "admin_key") return "Admin key";
  return event.actorEmail ?? event.actorKind;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The last changes made from this console or with the admin key. */
export function PlatformAuditCard() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "unavailable">("loading");

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { events: AuditEvent[] | null }) => {
        setEvents(data.events);
        setState(data.events ? "ready" : "unavailable");
      })
      .catch(() => setState("failed"));
  }, []);

  return (
    <section className="card mb-8 p-6" aria-label="Admin changes">
      <p className="home-os-kicker">Audit</p>
      <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">Who changed what?</h2>
      <p className="mt-2 font-sans text-sm text-ash">
        Every shop, line, toll-free, gallery and prospect change made here or with the admin key.
      </p>
      {state === "failed" ? (
        <p className="mt-4 font-sans text-sm text-ash">The audit trail didn&apos;t load. Try again in a moment.</p>
      ) : state === "unavailable" ? (
        <p className="mt-4 font-sans text-sm text-ash">The audit table isn&apos;t on this database yet.</p>
      ) : state === "loading" ? (
        <p className="mt-4 font-sans text-sm text-ash">Loading…</p>
      ) : events && events.length === 0 ? (
        <p className="mt-4 font-sans text-sm text-ash">No changes recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events?.map((event) => (
            <li key={event.id} className="rounded-md border border-rule px-3 py-2.5 font-sans text-sm">
              <p className="text-void">{event.summary}</p>
              <p className="mt-1 text-xs text-ash">
                {who(event)} · {when(event.createdAt)} · {event.action}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
