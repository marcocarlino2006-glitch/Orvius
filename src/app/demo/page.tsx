"use client";

import Link from "next/link";
import { useState } from "react";

const presets = [
  {
    label: "AC emergency",
    callerName: "Maria Lopez",
    callerPhone: "+15125550123",
    serviceType: "AC not cooling",
    urgency: "emergency" as const,
    address: "1842 Oak Street, Austin TX",
    notes: "No cool air since this morning. Prefers today after 4pm.",
  },
  {
    label: "Plumbing estimate",
    callerName: "James Carter",
    callerPhone: "+15125550199",
    serviceType: "Water heater estimate",
    urgency: "this-week" as const,
    address: "902 Cedar Ave, Round Rock TX",
    notes: "Looking for quote on tankless replacement.",
  },
  {
    label: "Electrical same-day",
    callerName: "Priya Patel",
    callerPhone: "+15125550888",
    serviceType: "Breaker keeps tripping",
    urgency: "same-day" as const,
    address: "4412 Lakeview Dr, Austin TX",
    notes: "Kitchen circuit trips when microwave runs.",
  },
];

export default function DemoPage() {
  const [form, setForm] = useState(presets[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    summary: string;
    leadId: string;
    business: { name: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDemo(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/demo/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Demo failed");
      setResult({
        summary: data.summary,
        leadId: data.leadId,
        business: data.business,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link href="/" className="text-sm text-sky-300 hover:underline">
          ← Orvius
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">Product demo</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Simulate a completed receptionist call — no Twilio or Vapi required.
          Use this to walk owners through what happens when Orvius answers.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => setForm(preset)}
            className="btn btn-secondary text-sm"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={runDemo} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Caller name">
            <input
              className="input"
              required
              value={form.callerName}
              onChange={(e) => setForm({ ...form, callerName: e.target.value })}
            />
          </Field>
          <Field label="Caller phone">
            <input
              className="input"
              required
              value={form.callerPhone}
              onChange={(e) => setForm({ ...form, callerPhone: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service needed">
            <input
              className="input"
              required
              value={form.serviceType}
              onChange={(e) =>
                setForm({ ...form, serviceType: e.target.value })
              }
            />
          </Field>
          <Field label="Urgency">
            <select
              className="input"
              value={form.urgency}
              onChange={(e) =>
                setForm({
                  ...form,
                  urgency: e.target.value as typeof form.urgency,
                })
              }
            >
              <option value="emergency">Emergency</option>
              <option value="same-day">Same day</option>
              <option value="this-week">This week</option>
              <option value="flexible">Flexible</option>
            </select>
          </Field>
        </div>

        <Field label="Address">
          <input
            className="input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>

        <Field label="Notes">
          <textarea
            className="input min-h-24"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button disabled={loading} className="btn btn-primary">
          {loading ? "Running demo call..." : "Simulate call → create lead"}
        </button>
      </form>

      {result && (
        <div className="card mt-6 border-green-500/30 p-6">
          <p className="text-sm font-medium text-green-300">Demo call completed</p>
          <p className="mt-2 text-sm text-muted">Business: {result.business.name}</p>
          <p className="mt-3 leading-relaxed">{result.summary}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-secondary text-sm">
              View on dashboard
            </Link>
            <span className="text-xs text-muted self-center">
              Lead ID: {result.leadId}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
