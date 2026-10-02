"use client";

import { useEffect, useState } from "react";
import { BUSINESS_TYPES, type TextingDetails, type TextingStatus } from "@/lib/shop-texting-copy";
import { ScGroup, ScRow, ScStatus } from "./settings-primitives";

type State = {
  available: boolean;
  hasOwnNumber: boolean;
  number: string | null;
  status: TextingStatus | null;
  copy: string | null;
  failureReason: string | null;
  details: TextingDetails | null;
};

type Field = { key: keyof TextingDetails; label: string; placeholder?: string; type?: string; autoComplete?: string };

const FIELDS: Field[] = [
  { key: "legalName", label: "Legal business name", placeholder: "Ray's Heating & Air LLC", autoComplete: "organization" },
  { key: "ein", label: "EIN", placeholder: "12-3456789" },
  { key: "website", label: "Website or public page", placeholder: "raysheating.com", autoComplete: "url" },
  { key: "street", label: "Street", autoComplete: "address-line1" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "region", label: "State", placeholder: "TX", autoComplete: "address-level1" },
  { key: "postalCode", label: "ZIP", autoComplete: "postal-code" },
  { key: "repFirstName", label: "Your first name", autoComplete: "given-name" },
  { key: "repLastName", label: "Your last name", autoComplete: "family-name" },
  { key: "repTitle", label: "Your title", placeholder: "Owner", autoComplete: "organization-title" },
  { key: "repEmail", label: "Your email", type: "email", autoComplete: "email" },
  { key: "repPhone", label: "Your mobile", type: "tel", autoComplete: "tel" },
];

const IN_REVIEW: TextingStatus[] = ["submitted", "profile_review", "brand_review", "campaign_review"];

function blank(): Record<keyof TextingDetails, string> {
  return {
    legalName: "",
    businessType: "Limited Liability Corporation",
    ein: "",
    website: "",
    street: "",
    city: "",
    region: "",
    postalCode: "",
    repFirstName: "",
    repLastName: "",
    repEmail: "",
    repPhone: "",
    repTitle: "Owner",
  };
}

export function TextingGroup({ shopName }: { shopName: string }) {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof TextingDetails, string>>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/account/texting", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as State;
    setState(next);
    if (next.details) setForm({ ...next.details, ein: "" });
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    setBusy(true);
    setMessage(null);
    setErrors({});
    const res = await fetch("/api/account/texting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as { error?: string; errors?: typeof errors; copy?: string } | null;
    if (!res?.ok) {
      setErrors(data?.errors ?? {});
      setMessage({ text: data?.error ?? "Could not send. Check your connection and try again.", error: true });
      return;
    }
    setOpen(false);
    await load();
  }

  if (!state) return null;
  const { status } = state;
  const shared = "Until then, your customer and tech texts keep going out from the shared Orvius number.";

  return (
    <ScGroup title="Texting from your number">
      {!state.hasOwnNumber ? (
        <ScRow label="Texts go out from the Orvius number" hint="Once your shop has its own Orvius number, you can register it for texting here." />
      ) : status === "approved" ? (
        <ScRow
          label={`Texts come from ${state.number}`}
          hint="Confirmations, on-the-way texts and reminders go out from your own number, and replies come straight back to it."
        >
          <ScStatus on>Approved</ScStatus>
        </ScRow>
      ) : status && IN_REVIEW.includes(status) ? (
        <ScRow label="With the carriers" hint={`${state.copy} ${shared}`}>
          <ScStatus on={false}>In review</ScStatus>
        </ScRow>
      ) : !state.available ? (
        <ScRow
          label="Texts go out from the Orvius number"
          hint={`Sending from ${state.number} needs carrier registration, which Orvius hasn't switched on yet. Calls to ${shopName} are answered on your own number either way.`}
        />
      ) : (
        <ScRow
          label={status === "failed" ? "The carriers turned it down" : `Send texts from ${state.number}`}
          hint={
            status === "failed"
              ? `${state.failureReason ?? state.copy} ${shared}`
              : `US carriers block business texts from a local number until the business is registered. Orvius files it for you; review takes days to a few weeks. ${shared}`
          }
        >
          {open ? null : (
            <button type="button" className="sc-btn sc-btn--primary" onClick={() => setOpen(true)}>
              {status === "failed" ? "Fix and send again" : "Register"}
            </button>
          )}
        </ScRow>
      )}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <ScRow label="Business type" hint={errors.businessType ? <span className="sc-field-error">{errors.businessType}</span> : undefined}>
            <select
              className="sc-input sc-input--select"
              aria-label="Business type"
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </ScRow>
          {FIELDS.map((f) => (
            <ScRow key={f.key} label={f.label} hint={errors[f.key] ? <span className="sc-field-error">{errors[f.key]}</span> : undefined}>
              <input
                className="sc-input"
                aria-label={f.label}
                aria-invalid={errors[f.key] ? true : undefined}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </ScRow>
          ))}
          <ScRow label="Must match your IRS letter exactly" hint="Carriers check the name and EIN against IRS records. A mismatch is the most common reason for a refusal.">
            <button type="button" className="sc-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
              {busy ? "Sending…" : "Send to carriers"}
            </button>
          </ScRow>
        </form>
      ) : null}
      {message ? (
        <p className={message.error ? "sc-banner sc-banner--error" : "sc-banner"} role="status">
          {message.text}
        </p>
      ) : null}
    </ScGroup>
  );
}
