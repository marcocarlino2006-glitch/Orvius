"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/toaster";
import { ScGroup, ScRow } from "./settings-primitives";

type Grant = {
  id: string;
  granteeEmail: string;
  scope: string;
  maxCents: number | null;
  expiresAt: string;
  policyVersion: string;
  grantedBy: string;
  revokedAt: string | null;
  active: boolean;
};

type Person = { email: string; role: string; you: boolean };

const SCOPE_LABEL: Record<string, string> = {
  confirm_payment: "Accept or turn down a customer's \"I paid\"",
  revise_bill: "Change a bill the customer already has",
  price_book: "Edit the price book",
  resolve_payment: "Close a payment mismatch",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function status(grant: Grant, policyVersion: string) {
  if (grant.revokedAt) return `Revoked ${new Date(grant.revokedAt).toLocaleDateString()}`;
  if (new Date(grant.expiresAt).getTime() <= Date.now()) return "Expired";
  if (grant.policyVersion !== policyVersion) return "Written under older terms; not honored. Issue a new one.";
  return `Until ${new Date(grant.expiresAt).toLocaleDateString()}`;
}

/**
 * Owner-only: who else may move money, for which one kind of action, up to
 * what amount and until when. Nothing here changes a role; a manager without a
 * grant is refused these actions and can still bill jobs and log cash.
 */
export function MoneyGrantsGroup() {
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "signed_out" | "error">("loading");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [policyVersion, setPolicyVersion] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState({ email: "", scope: "confirm_payment", cap: "", days: "30" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res, team] = await Promise.all([
      fetch("/api/money-grants", { cache: "no-store" }).catch(() => null),
      fetch("/api/team", { cache: "no-store" }).catch(() => null),
    ]);
    if (!res) return setState("error");
    if (res.status === 401) return setState("signed_out");
    if (res.status === 403) return setState("forbidden");
    if (!res.ok) return setState("error");
    const data = (await res.json()) as { grants: Grant[]; scopes: string[]; policyVersion: string };
    setGrants(data.grants);
    setScopes(data.scopes);
    setPolicyVersion(data.policyVersion);
    if (team?.ok) {
      const t = (await team.json()) as { people: Person[] };
      setPeople(t.people.filter((p) => p.role !== "owner"));
    }
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const cap = form.cap.trim() ? Math.round(Number(form.cap.replace(/[$,]/g, "")) * 100) : null;
      if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) {
        setError("Enter a dollar limit, or leave it empty for no limit.");
        return;
      }
      const res = await fetch("/api/money-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granteeEmail: form.email, scope: form.scope, maxCents: cap, days: Number(form.days) }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (!res?.ok) {
        setError(data?.error ?? "Couldn't save the grant. Your entries are still here; try again.");
        return;
      }
      toast({ title: `${form.email} may now ${(SCOPE_LABEL[form.scope] ?? form.scope).toLowerCase()}` });
      setForm((f) => ({ ...f, email: "", cap: "" }));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grant: Grant) {
    if (!window.confirm(`Revoke ${grant.granteeEmail}'s right to ${(SCOPE_LABEL[grant.scope] ?? grant.scope).toLowerCase()}? It stops at once.`)) return;
    const res = await fetch(`/api/money-grants?id=${encodeURIComponent(grant.id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast({ title: data?.error ?? "Couldn't revoke it. It is still active.", tone: "error" });
      return;
    }
    toast({ title: "Revoked" });
    await load();
  }

  if (state === "forbidden") return null;

  return (
    <ScGroup title="Money rights">
      {state === "loading" ? (
        <p className="sc-muted sc-pad" aria-busy="true">
          Loading…
        </p>
      ) : state === "signed_out" ? (
        <p className="sc-banner sc-banner--error" role="alert">
          You're signed out. <a href={`/login?callbackUrl=${encodeURIComponent("/dashboard?settings=team")}`}>Sign in</a> to manage money rights.
        </p>
      ) : state === "error" ? (
        <p className="sc-banner sc-banner--error" role="alert">
          Couldn&apos;t load money rights. No grant was changed.{" "}
          <button type="button" className="sc-btn" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <p className="sc-muted sc-pad">
            Only you can accept a payment you didn&apos;t take, change a bill a customer already has, edit prices or close a payment mismatch, unless you give
            someone that one right here. Billing jobs and logging cash in hand don&apos;t need a grant.
          </p>
          {grants.length === 0 ? (
            <ScRow label="No one else has money rights" hint="Teammates are refused these actions and asked to check with you." />
          ) : (
            grants.map((grant) => (
              <div key={grant.id} className="sc-row">
                <div className="sc-row-copy">
                  <p className="sc-row-label">
                    {grant.granteeEmail} · {SCOPE_LABEL[grant.scope] ?? grant.scope}
                  </p>
                  <p className="sc-row-hint">
                    {grant.maxCents == null ? "No amount limit" : `Up to ${money(grant.maxCents)}`} · {status(grant, policyVersion)} · granted by {grant.grantedBy}
                  </p>
                </div>
                {grant.active ? (
                  <div className="sc-row-control">
                    <button type="button" className="sc-btn" onClick={() => void revoke(grant)}>
                      Revoke
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
          <ScRow stack label="Give a money right" hint="One kind of action, for up to 90 days. Checked each time it is used, and logged with this grant.">
            <form
              className="sc-inline-field sc-grant-form"
              onSubmit={(e) => {
                e.preventDefault();
                void issue();
              }}
            >
              <select
                className="sc-input"
                aria-label="Teammate"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              >
                <option value="">{people.length ? "Choose a teammate" : "Add a teammate first"}</option>
                {people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.email}
                  </option>
                ))}
              </select>
              <select className="sc-input" aria-label="Money action" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                {scopes.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
              <input
                className="sc-input sc-input--narrow"
                aria-label="Dollar limit (optional)"
                placeholder="Limit $ (optional)"
                inputMode="decimal"
                value={form.cap}
                onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))}
              />
              <select className="sc-input sc-input--narrow" aria-label="How long" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
                {["7", "30", "60", "90"].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
              <button type="submit" className="sc-btn sc-btn--primary" disabled={busy || !form.email}>
                {busy ? "Saving…" : "Give right"}
              </button>
            </form>
          </ScRow>
          {error ? (
            <p className="sc-banner sc-banner--error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </ScGroup>
  );
}
