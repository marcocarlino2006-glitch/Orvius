"use client";

import { useEffect, useState } from "react";

type PortState = {
  pinAccepted: boolean;
  request: { number: string; carrier: string; status: string; copy: string; note: string | null } | null;
};

const FIELDS = [
  { key: "number", label: "Number to keep", placeholder: "(512) 555-0100", type: "tel" },
  { key: "carrier", label: "Current carrier", placeholder: "Verizon, AT&T, RingCentral…" },
  { key: "accountName", label: "Name on the account" },
  { key: "accountNumber", label: "Account number" },
  { key: "pin", label: "Port-out PIN", placeholder: "Your carrier gives it on request" },
  { key: "serviceAddress", label: "Service address on the bill", autoComplete: "street-address" },
  { key: "authorizedName", label: "Person authorized on the account", autoComplete: "name" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

/** Moving the shop's existing number onto Orvius: one form instead of an email with a bill and a PIN. */
export function PortRequestForm() {
  const [state, setState] = useState<PortState | null>(null);
  const [form, setForm] = useState<Record<Key, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<Key, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/account/port", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState((await res.json()) as PortState);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await fetch("/api/account/port", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as { error?: string; errors?: typeof errors } | null;
    if (!res?.ok) {
      setErrors(data?.errors ?? {});
      setError(data?.error ?? "Could not send. Check your connection and try again.");
      return;
    }
    await load();
  }

  if (!state) return null;
  if (state.request && state.request.status !== "failed") {
    return (
      <p className="account-settings-hint" role="status">
        {state.request.number} from {state.request.carrier}: {state.request.copy}
      </p>
    );
  }

  return (
    <form
      className="port-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="account-settings-hint">
        {state.request?.status === "failed"
          ? `${state.request.note ?? state.request.copy}`
          : "Porting moves the number customers already know to Orvius, so nothing printed has to change. Copy these from your latest bill."}
      </p>
      {FIELDS.filter((f) => f.key !== "pin" || state.pinAccepted).map((f) => (
        <label key={f.key} className="port-form-field">
          <span className="port-form-label">{f.label}</span>
          <input
            className="input"
            type={"type" in f ? f.type : "text"}
            placeholder={"placeholder" in f ? f.placeholder : undefined}
            autoComplete={"autoComplete" in f ? f.autoComplete : "off"}
            aria-invalid={errors[f.key] ? true : undefined}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          />
          {errors[f.key] ? <span className="text-sm text-signal">{errors[f.key]}</span> : null}
        </label>
      ))}
      <p className="account-settings-hint">
        Don&apos;t cancel your current service: that can release the number. Keep it forwarded to Orvius until the port
        is done. {state.pinAccepted ? "" : "We'll ask you for the port-out PIN when we file. "}Your carrier sets the
        date; Orvius texts it to you.
      </p>
      {error ? (
        <p className="text-sm text-signal" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-void text-sm" disabled={busy}>
        {busy ? "Sending…" : "Move my number to Orvius"}
      </button>
    </form>
  );
}
