"use client";

import { useState } from "react";

type EditableLead = {
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  notes: string | null;
};

export function LeadQualificationForm({
  leadId,
  lead,
  onSaved,
}: {
  leadId: string;
  lead: EditableLead;
  onSaved: (lead: EditableLead, booked: boolean) => void;
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
      const booked = Boolean(data.autoBook?.created || data.lead?.job);
      onSaved(values, booked);
      setMessage(
        booked
          ? "Lead completed and booked automatically."
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
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
          />
        </label>
        <label>
          <span>Callback number</span>
          <input
            className="input"
            type="tel"
            required
            value={values.phone}
            onChange={(event) =>
              setValues({ ...values, phone: event.target.value })
            }
          />
        </label>
        <label>
          <span>Service needed</span>
          <input
            className="input"
            required
            value={values.serviceType}
            onChange={(event) =>
              setValues({ ...values, serviceType: event.target.value })
            }
          />
        </label>
        <label>
          <span>Urgency</span>
          <select
            className="input"
            value={values.urgency}
            onChange={(event) =>
              setValues({ ...values, urgency: event.target.value })
            }
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
          onChange={(event) =>
            setValues({ ...values, address: event.target.value })
          }
        />
      </label>
      <label>
        <span>Notes</span>
        <textarea
          className="input"
          rows={3}
          value={values.notes}
          onChange={(event) =>
            setValues({ ...values, notes: event.target.value })
          }
        />
      </label>
      <div className="lead-qualification-actions">
        <button type="submit" className="btn btn-void" disabled={saving}>
          {saving ? "Saving…" : "Save and continue automation"}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </form>
  );
}
