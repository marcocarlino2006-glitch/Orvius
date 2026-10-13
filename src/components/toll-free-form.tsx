"use client";

import { useState } from "react";
import { FormField } from "@/components/shell-primitives";

const FIELDS = [
  ["ein", "EIN", "12-3456789"],
  ["street", "Street (as on the EIN record)", "100 Main St"],
  ["street2", "Suite (optional)", ""],
  ["city", "City", ""],
  ["state", "State", "TX"],
  ["postalCode", "ZIP", ""],
  ["firstName", "Your first name", ""],
  ["lastName", "Your last name", ""],
  ["phone", "Your phone", ""],
] as const;

type Key = (typeof FIELDS)[number][0];

/** The only facts Twilio needs that Orvius can't know; everything else is filed for you. */
export function TollFreeForm() {
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, ""])) as Record<Key, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) return <p className="ml-5 mt-2 text-xs text-live">{done}</p>;

  return (
    <form
      className="ml-5 mt-3 grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        fetch("/api/admin/toll-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, street2: values.street2 || undefined }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "That didn't go through. Try again.");
            setDone("Sent to Twilio. Review usually takes a few business days; this card shows the result.");
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : "That didn't go through. Try again."))
          .finally(() => setBusy(false));
      }}
    >
      {FIELDS.map(([key, label, placeholder]) => (
        <FormField key={key} label={label} required={key !== "street2"}>
          <input
            className="input"
            required={key !== "street2"}
            placeholder={placeholder}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </FormField>
      ))}
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-void text-xs" disabled={busy}>
          {busy ? "Sending…" : "Send to Twilio"}
        </button>
        <span className="text-xs text-ash">
          Business name, website, use case, sample texts, opt-in and policies are filled in from Orvius.
        </span>
      </div>
      {error ? (
        <p className="sm:col-span-3 text-xs text-flare" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
