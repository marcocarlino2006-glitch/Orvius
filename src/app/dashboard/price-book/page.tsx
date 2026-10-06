"use client";

import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellLoading, ShellPanel } from "@/components/shell-primitives";
import { toast } from "@/components/toaster";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; name: string; kind: string; unitCents: number; description: string | null };
type Draft = { name: string; kind: string; price: string; description: string };

const KINDS = [
  { value: "service", label: "Service" },
  { value: "labor", label: "Labor" },
  { value: "part", label: "Part" },
  { value: "discount", label: "Discount" },
];
const EMPTY: Draft = { name: "", kind: "service", price: "", description: "" };

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function toBody(d: Draft) {
  const dollars = Number(d.price.replace(/[$,\s]/g, ""));
  if (!d.name.trim()) throw new Error("Name it first.");
  if (!d.price.trim() || !Number.isFinite(dollars) || dollars < 0) throw new Error("Give it a price in dollars.");
  return { name: d.name.trim(), kind: d.kind, unitCents: Math.round(dollars * 100), description: d.description.trim() || null };
}

function ItemForm({ draft, setDraft, busy, submitLabel, onCancel }: { draft: Draft; setDraft: (d: Draft) => void; busy: boolean; submitLabel: string; onCancel?: () => void }) {
  return (
    <div className="pb-form">
      <input className="input" placeholder="Name, like “Drain clearing”" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" />
      <select className="wc-select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} aria-label="Kind">
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <input className="input pb-price" inputMode="decimal" placeholder="$ price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} aria-label="Price in dollars" />
      <input className="input pb-desc" placeholder="What it includes (optional)" value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Description" />
      <div className="pb-form-actions">
        <button type="submit" className="ox-btn ox-btn--sm" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The shop's saved prices. Technicians pick from this list on the job. */
export default function PriceBookPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/price-book");
    const data = (await res.json().catch(() => ({}))) as { items?: Item[]; error?: string };
    if (!res.ok) return setError(data.error ?? "Couldn't load the price book.");
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      await load();
      return true;
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "That didn't save.", tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <OsShell title="Price book" subtitle="Your saved prices. Technicians add these to a job from their phone, and the customer is billed the total.">
      {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
      <ShellPanel title="Add a price" dense>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const body = toBody(draft);
              void send("/api/price-book", "POST", body).then((ok) => {
                if (ok) {
                  setDraft(EMPTY);
                  toast({ title: `Added ${body.name}` });
                }
              });
            } catch (err) {
              toast({ title: (err as Error).message, tone: "error" });
            }
          }}
        >
          <ItemForm draft={draft} setDraft={setDraft} busy={busy} submitLabel="Add to price book" />
        </form>
      </ShellPanel>

      <ShellPanel title={items ? `${items.length} saved price${items.length === 1 ? "" : "s"}` : "Saved prices"} dense>
        {!items ? (
          <ShellLoading />
        ) : items.length === 0 ? (
          <p className="jf-muted">Nothing saved yet. Add the jobs you do most, like a service call fee or a water heater flush, so every technician charges the same.</p>
        ) : (
          <>
            {items.length > 8 ? <input className="input pb-search" placeholder="Search prices" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search prices" /> : null}
            <ul className="pb-list">
              {shown.map((item) =>
                editing?.id === item.id ? (
                  <li key={item.id} className="pb-row pb-row--editing">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        try {
                          void send(`/api/price-book/${item.id}`, "PATCH", toBody(editing.draft)).then((ok) => ok && setEditing(null));
                        } catch (err) {
                          toast({ title: (err as Error).message, tone: "error" });
                        }
                      }}
                    >
                      <ItemForm draft={editing.draft} setDraft={(d) => setEditing({ id: item.id, draft: d })} busy={busy} submitLabel="Save" onCancel={() => setEditing(null)} />
                    </form>
                  </li>
                ) : (
                  <li key={item.id} className="pb-row">
                    <div className="pb-row-main">
                      <span className="jf-line-name">{item.name}</span>
                      <span className="jf-line-kind">
                        {KINDS.find((k) => k.value === item.kind)?.label ?? "Service"}
                        {item.description ? ` · ${item.description}` : ""}
                      </span>
                    </div>
                    <span className="pb-row-price">
                      {item.kind === "discount" ? "−" : ""}
                      {usd(item.unitCents)}
                    </span>
                    <div className="pb-row-actions">
                      <button
                        type="button"
                        className="ox-btn ox-btn--quiet ox-btn--sm"
                        onClick={() => setEditing({ id: item.id, draft: { name: item.name, kind: item.kind, price: (item.unitCents / 100).toFixed(2), description: item.description ?? "" } })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ox-btn ox-btn--quiet ox-btn--sm"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${item.name}? Jobs that already used it keep their lines.`)) void send(`/api/price-book/${item.id}`, "DELETE");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </ShellPanel>
    </OsShell>
  );
}
