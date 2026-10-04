"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "./win-back-card.css";
import "./plans-card.css";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  visitsPerYear: number;
  perks: string | null;
  isActive: boolean;
  active: number;
  pastDue: number;
};
type Member = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  plan: string;
  price: string;
  nextVisitDueAt: string | null;
  customerId: string | null;
};
type Data = { canAcceptPayments: boolean; link: string | null; mrrCents: number; plans: Plan[]; members: Member[] };

function money(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function dueLabel(iso: string | null) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Visit overdue ${-days}d`;
  if (days === 0) return "Visit due today";
  if (days <= 30) return `Visit due in ${days}d`;
  return `Next visit ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const EMPTY = { name: "", price: "", interval: "month", visitsPerYear: "2", perks: "" };

export function PlansCard() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/plans");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          priceCents: Math.round(Number(form.price) * 100),
          interval: form.interval,
          visitsPerYear: Number(form.visitsPerYear),
          perks: form.perks,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That didn't save. Try again.");
        return;
      }
      setForm(EMPTY);
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const patch = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) setError(body?.error ?? "That didn't save.");
    await load();
  };

  const activeMembers = data.members.filter((m) => m.status !== "canceled");
  const pastDue = data.members.filter((m) => m.status === "past_due").length;
  const livePlans = data.plans.filter((p) => p.isActive);

  return (
    <section className="wb pc font-sans" aria-label="Maintenance plans">
      <div className="wb-top">
        <div>
          <p className="wb-figure">
            {activeMembers.length
              ? `${activeMembers.length} plan member${activeMembers.length === 1 ? "" : "s"} · ${money(data.mrrCents)}/mo recurring`
              : "Maintenance plans"}
          </p>
          <p className="wb-sub">
            {activeMembers.length
              ? `${pastDue ? `${pastDue} card${pastDue === 1 ? "" : "s"} failed; Stripe is retrying. ` : ""}Members get a text when their included visit is due.`
              : "Sell a monthly or yearly plan. Customers join from a link, pay you directly, and Orvius texts them when a visit is due."}
          </p>
        </div>
        {!open ? (
          <button type="button" className="btn btn-void text-sm" onClick={() => setOpen(true)}>
            {data.plans.length ? "Add a plan" : "Create a plan"}
          </button>
        ) : null}
      </div>

      {!data.canAcceptPayments ? (
        <p className="pc-note">
          Plans go on sale once card payments are set up.{" "}
          <Link href="/dashboard/billing">Set up payments</Link>
        </p>
      ) : data.link && livePlans.length ? (
        <div className="pc-link">
          <code>{data.link}</code>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => {
              void navigator.clipboard.writeText(data.link!).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy join link"}
          </button>
        </div>
      ) : null}

      {open ? (
        <form
          className="wb-compose pc-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="wb-label">
            Plan name
            <input
              value={form.name}
              maxLength={60}
              placeholder="Comfort Club"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <div className="pc-row">
            <label className="wb-label">
              Price ($)
              <input
                inputMode="decimal"
                value={form.price}
                placeholder="19"
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
                required
              />
            </label>
            <label className="wb-label">
              Billed
              <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            <label className="wb-label">
              Visits a year
              <select value={form.visitsPerYear} onChange={(e) => setForm({ ...form, visitsPerYear: e.target.value })}>
                {[0, 1, 2, 3, 4, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "None" : n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="wb-label">
            What&apos;s included, one per line
            <textarea
              rows={3}
              maxLength={400}
              value={form.perks}
              placeholder={"Priority scheduling\n15% off repairs\nNo overtime fee"}
              onChange={(e) => setForm({ ...form, perks: e.target.value })}
            />
          </label>
          {error ? (
            <p className="wb-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="wb-actions">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-void text-sm" disabled={busy}>
              {busy ? "Saving…" : "Save plan"}
            </button>
          </div>
        </form>
      ) : null}

      {data.plans.length ? (
        <ul className="pc-plans">
          {data.plans.map((p) => (
            <li key={p.id} className={p.isActive ? "" : "is-off"}>
              <span className="pc-plan-name">{p.name}</span>
              <span className="pc-plan-meta">
                {money(p.priceCents)}/{p.interval === "year" ? "yr" : "mo"}
                {p.visitsPerYear ? ` · ${p.visitsPerYear} visit${p.visitsPerYear === 1 ? "" : "s"}/yr` : ""} · {p.active} member
                {p.active === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => void patch({ action: "toggle", planId: p.id, isActive: !p.isActive })}
              >
                {p.isActive ? "Stop selling" : "Sell again"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {activeMembers.length ? (
        <ul className="pc-members" aria-label="Members">
          {activeMembers.slice(0, 50).map((m) => (
            <li key={m.id}>
              <span className="pc-plan-name">
                {m.customerId ? <Link href={`/dashboard/customers/${m.customerId}`}>{m.name ?? m.phone}</Link> : m.name ?? m.phone}
              </span>
              <span className="pc-plan-meta">
                {m.plan} · {m.price}
                {m.status === "past_due" ? <span className="pc-bad"> · Card failed</span> : null}
              </span>
              {m.nextVisitDueAt ? (
                <span className="pc-due">
                  {dueLabel(m.nextVisitDueAt)}
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    onClick={() => void patch({ action: "visit_done", memberId: m.id })}
                  >
                    Visit done
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
