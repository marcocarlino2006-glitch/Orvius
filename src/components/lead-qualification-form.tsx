"use client";

import { useMemo, useState } from "react";
import { DEMAND_CATEGORIES } from "@/lib/job-taxonomy";
import type { Trade } from "@/lib/trades";

type EditableLead = {
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  notes: string | null;
};

const HVAC_CATEGORIES = DEMAND_CATEGORIES.filter(
  (c) => c.trade === "HVAC",
);

export function LeadQualificationForm({
  leadId,
  lead,
  trade = "HVAC",
  onSaved,
  onDraftChange,
}: {
  leadId: string;
  lead: EditableLead;
  /** Wedge default is HVAC — taxonomy select when trade matches. */
  trade?: Trade | null;
  onSaved: (booked: boolean) => void;
  onDraftChange?: (lead: {
    name: string;
    phone: string;
    serviceType: string;
    urgency: string;
    address: string;
    notes: string;
  }) => void;
}) {
  const [values, setValues] = useState({
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    serviceType: lead.serviceType ?? "",
    urgency: lead.urgency ?? "flexible",
    address: lead.address ?? "",
    notes: lead.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hvacMode = trade === "HVAC";
  const matchedHvac = useMemo(() => {
    if (!hvacMode) return null;
    const current = values.serviceType.trim().toLowerCase();
    return (
      HVAC_CATEGORIES.find(
        (c) =>
          c.label.toLowerCase() === current ||
          c.code === current ||
          c.patterns.some((p) => current.includes(p.trim())),
      ) ?? null
    );
  }, [hvacMode, values.serviceType]);

  function update<K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) {
    const next = { ...values, [key]: value };
    setValues(next);
    onDraftChange?.(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save lead");
      const newlyBooked = Boolean(data.autoBook?.created);
      const booked = Boolean(newlyBooked || data.lead?.job);
      const depositRetried = Boolean(
        data.depositRecovery?.ok && !data.depositRecovery?.skipped,
      );
      onSaved(booked);
      setMessage(
        newlyBooked
          ? "Lead completed and booked automatically."
          : depositRetried
            ? "Lead updated and deposit delivery retried."
            : booked
              ? "Lead details updated."
              : "Lead details saved. Orvius will book when the lead qualifies.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="lead-qualification-form font-sans" onSubmit={save}>
      <div className="lead-qualification-grid">
        <label>
          <span>Name</span>
          <input
            className="input"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </label>
        <label>
          <span>Callback number</span>
          <input
            className="input"
            type="tel"
            required
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </label>
        {hvacMode ? (
          <label>
            <span>HVAC problem</span>
            <select
              className="input"
              required
              value={matchedHvac?.label ?? ""}
              onChange={(event) => {
                const selected = HVAC_CATEGORIES.find(
                  (c) => c.label === event.target.value,
                );
                update("serviceType", selected?.label ?? event.target.value);
              }}
            >
              <option value="" disabled>
                Select HVAC category
              </option>
              {HVAC_CATEGORIES.map((c) => (
                <option key={c.code} value={c.label}>
                  {c.label}
                </option>
              ))}
              {!matchedHvac && values.serviceType ? (
                <option value={values.serviceType}>{values.serviceType}</option>
              ) : null}
            </select>
          </label>
        ) : (
          <label>
            <span>Service needed</span>
            <input
              className="input"
              required
              value={values.serviceType}
              onChange={(event) => update("serviceType", event.target.value)}
            />
          </label>
        )}
        <label>
          <span>Urgency</span>
          <select
            className="input"
            value={values.urgency}
            onChange={(event) => update("urgency", event.target.value)}
          >
            <option value="emergency">Emergency</option>
            <option value="same-day">Same day</option>
            <option value="this-week">This week</option>
            <option value="flexible">Flexible</option>
          </select>
        </label>
      </div>
      <label>
        <span>Service address</span>
        <input
          className="input"
          required
          value={values.address}
          onChange={(event) => update("address", event.target.value)}
        />
      </label>
      {hvacMode ? (
        <label>
          <span>HVAC notes</span>
          <textarea
            className="input"
            rows={3}
            placeholder="System type, floor/room, is it running, how long…"
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>
      ) : (
        <label>
          <span>Notes</span>
          <textarea
            className="input"
            rows={3}
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>
      )}
      <div className="lead-qualification-actions">
        <button type="submit" className="btn btn-void" disabled={saving}>
          {saving ? "Saving…" : "Save and continue automation"}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </form>
  );
}
