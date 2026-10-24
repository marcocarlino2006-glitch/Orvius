"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ShopArea } from "@/lib/find-shop";

type Payload = { area: ShopArea; lines: string[] };

/** The shop's area: who customers can already find, and the people still waiting. */
export function ShopAreaCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/area", { cache: "no-store" });
    if (!res.ok) return;
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;
  const { area, lines } = data;

  async function turnOn() {
    setBusy("network");
    setNote(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networkOn: true }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setNote(body.error ?? "The network didn't turn on.");
      return;
    }
    await load();
  }

  async function take(requestId: string) {
    setBusy(requestId);
    setNote(null);
    const res = await fetch("/api/account/area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; leadId?: string };
    setBusy(null);
    if (!res.ok) {
      setNote(body.error ?? "That request is already with a shop.");
      await load();
      return;
    }
    setNote("It's on your board.");
    await load();
  }

  return (
    <section className="op-panel font-sans" aria-label="Your area">
      <p className="op-title">Your area</p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {area.findPath ? (
        <p>
          <Link href={area.findPath}>See the search a customer sees</Link>
        </p>
      ) : null}
      {area.inviteUrl ? (
        <p>
          <a href={area.inviteUrl}>{area.inviteUrl}</a>
        </p>
      ) : null}
      {!area.networkOn && area.networkPartners > 0 ? (
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy === "network"} onClick={() => void turnOn()}>
          {busy === "network" ? "Turning on…" : "Turn on the network"}
        </button>
      ) : null}
      {area.waiting.length ? (
        <ul>
          {area.waiting.map((row) => (
            <li key={row.id}>
              <p>
                {row.name} · {row.phone}
              </p>
              <p>{row.need}</p>
              <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy === row.id} onClick={() => void take(row.id)}>
                {busy === row.id ? "Adding…" : "Add to the board"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
