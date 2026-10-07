"use client";

import { OsShell } from "@/components/os-shell";
import { ProFilterBar } from "@/components/pro-page-chrome";
import { ProLead } from "@/components/pro-lead";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { invalidateAccount } from "@/lib/account-client";
import type { Portfolio, PortfolioShop } from "@/lib/portfolio";
import { ROLE_LABELS } from "@/lib/workspace-access-labels";
import { useEffect, useState } from "react";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function lastCall(iso: string | null) {
  if (!iso) return "no calls yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `last call ${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `last call ${hours}h ago`;
  return `last call ${Math.round(hours / 24)}d ago`;
}

function lineState(shop: PortfolioShop) {
  if (!shop.lineLive) return { label: "No line", tone: "bad" as const };
  if (!shop.lineVerified) return { label: "Not proven", tone: "warn" as const };
  return { label: "Live", tone: "ok" as const };
}

type SortKey = "name" | "calls" | "waiting" | "collectedCents";

export default function PortfolioPage() {
  const [days, setDays] = useState("7");
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("waiting");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/portfolio?days=${days}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load locations."))))
      .then((next: Portfolio) => live && setData(next))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [days]);

  async function open(id: string) {
    setOpening(id);
    const res = await fetch("/api/shop/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: id }),
    }).catch(() => null);
    if (res?.ok) {
      invalidateAccount();
      window.location.assign("/dashboard");
      return;
    }
    setOpening(null);
    setError("Could not open that location.");
  }

  const t = data?.totals;
  const needle = query.trim().toLowerCase();
  const allShops = data?.shops ?? [];
  const shops = allShops
    .filter((s) => !needle || `${s.name} ${s.trade ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "waiting"
        ? b.waitingEmergencies - a.waitingEmergencies || b.waiting - a.waiting || a.name.localeCompare(b.name)
        : b[sort] - a[sort],
  );

  return (
    <OsShell title="Locations">
      <ProLead
        loading={!data}
        figure={t ? String(t.locations) : "—"}
        caption={t?.locations === 1 ? "Location" : "Locations"}
        detail={
          t && t.waitingEmergencies
            ? `${t.waitingEmergencies} emergency caller${t.waitingEmergencies === 1 ? " is" : "s are"} waiting on a callback.`
            : t && t.linesDown
              ? `${t.linesDown} location${t.linesDown === 1 ? " has" : "s have"} no Orvius line.`
              : undefined
        }
        facts={
          t
            ? [
                { label: "Calls answered", value: t.calls },
                { label: "Jobs booked", value: t.booked },
                { label: "Collected", value: money(t.collectedCents) },
                { label: "Waiting on callback", value: t.waiting, live: t.waiting > 0 },
              ]
            : []
        }
      />

      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="pf-controls">
            <ProFilterBar
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
              value={days}
              onChange={setDays}
            />
            {allShops.length > 8 ? (
              <input
                type="search"
                className="pf-search"
                placeholder="Find a location"
                aria-label="Find a location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            ) : null}
            <label className="pf-sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="waiting">Needs attention</option>
                <option value="calls">Most calls</option>
                <option value="collectedCents">Most collected</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div className="dt dt--portfolio font-sans" role="table" aria-label="Locations">
            <div className="dt-head" role="row">
              <span role="columnheader">Location</span>
              <span role="columnheader" className="dt-num">Calls</span>
              <span role="columnheader" className="dt-num">Requests</span>
              <span role="columnheader" className="dt-num">Booked</span>
              <span role="columnheader" className="dt-num">Done</span>
              <span role="columnheader" className="dt-num">Collected</span>
              <span role="columnheader" className="dt-num">Waiting</span>
              <span role="columnheader">Line</span>
            </div>
            {shops.map((shop) => {
              const line = lineState(shop);
              return (
                <div key={shop.id} className="dt-row dt-row--link" role="row">
                  <span className="dt-primary" role="cell">
                    <button
                      type="button"
                      className="dt-title dt-row-link pf-open"
                      disabled={opening !== null}
                      onClick={() => void open(shop.id)}
                      aria-label={`Open ${shop.name}`}
                    >
                      {shop.name}
                    </button>
                    <span className="dt-sub">
                      {opening === shop.id ? "Opening…" : [shop.trade, ROLE_LABELS[shop.role], lastCall(shop.lastCallAt)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="dt-num" role="cell" data-label="Calls">{shop.calls}</span>
                  <span className="dt-num" role="cell" data-label="Requests">{shop.leads}</span>
                  <span className="dt-num" role="cell" data-label="Booked">{shop.booked}</span>
                  <span className="dt-num" role="cell" data-label="Done">{shop.completed}</span>
                  <span className="dt-num" role="cell" data-label="Collected">{money(shop.collectedCents)}</span>
                  <span className={`dt-num${shop.waitingEmergencies ? " pf-hot" : ""}`} role="cell" data-label="Waiting">
                    {shop.waiting}
                    {shop.waitingEmergencies ? <span className="pf-hot-note">{shop.waitingEmergencies} urgent</span> : null}
                  </span>
                  <span role="cell" data-label="Line" className={`pf-line pf-line--${line.tone}`}>
                    {line.label}
                  </span>
                </div>
              );
            })}
            {needle && !shops.length ? (
              <p className="pf-empty">No location matches “{query.trim()}”.</p>
            ) : null}
          </div>
          {data.truncated ? (
            <p className="pf-foot">Showing the first {data.shops.length} locations this sign-in can open.</p>
          ) : null}
          <p className="pf-foot">
            Calls, requests, bookings, completions and money are counted over the last {data.days} days. Waiting counts every
            request with no callback yet, however old. Collected is every recorded payment and paid deposit, the same figure as each shop&apos;s Performance page.
          </p>
        </>
      )}
    </OsShell>
  );
}
