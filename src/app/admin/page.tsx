"use client";

import { AppShell } from "@/components/app-shell";
import { FormField, ShellBadge } from "@/components/shell-primitives";
import { useEffect, useState } from "react";

type Business = {
  id: string;
  name: string;
  slug: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  greeting: string | null;
  vapiAssistantId: string | null;
  vapiPhoneNumber: string | null;
  twilioPhone: string | null;
  _count?: { calls: number; leads: number };
};

type HealthStatus = {
  configured: boolean;
  webhookUrl: string;
  smsWebhookUrl: string;
  config: Array<{ name: string; configured: boolean; optional: boolean }>;
};

const defaultServices = JSON.stringify(
  [
    { name: "Emergency repair", description: "Same-day urgent service" },
    { name: "Estimate / inspection", description: "On-site quote visit" },
    { name: "Maintenance", description: "Scheduled maintenance visit" },
  ],
  null,
  2,
);

const defaultHours = JSON.stringify(
  {
    monday: { open: "08:00", close: "18:00" },
    tuesday: { open: "08:00", close: "18:00" },
    wednesday: { open: "08:00", close: "18:00" },
    thursday: { open: "08:00", close: "18:00" },
    friday: { open: "08:00", close: "18:00" },
    saturday: { open: "09:00", close: "14:00" },
    sunday: { closed: true, open: "00:00", close: "00:00" },
  },
  null,
  2,
);

export default function AdminPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [form, setForm] = useState({
    name: "",
    ownerPhone: "",
    ownerEmail: "",
    greeting: "",
    twilioPhone: "",
    vapiPhoneNumber: "",
    hoursJson: defaultHours,
    servicesJson: defaultServices,
  });

  async function loadBusinesses() {
    setLoading(true);
    try {
      const res = await fetch("/api/businesses");
      const data = await res.json();
      setBusinesses(data);
    } catch {
      setError("Failed to load businesses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBusinesses();
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create business");

      setSuccess(
        `Created ${data.name}. Vapi assistant ID: ${data.vapiAssistantId}`,
      );
      setForm({
        name: "",
        ownerPhone: "",
        ownerEmail: "",
        greeting: "",
        twilioPhone: "",
        vapiPhoneNumber: "",
        hoursJson: defaultHours,
        servicesJson: defaultServices,
      });
      await loadBusinesses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this business and its Vapi assistant?")) return;

    const res = await fetch(`/api/businesses?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete business");
      return;
    }
    await loadBusinesses();
  }

  return (
    <AppShell
      title="Business setup"
      subtitle="Create a business, provision a Vapi assistant, and connect your Twilio number."
      statusLabel={health?.configured ? "Ready to provision" : "Setup needed"}
    >
      {health && (
        <section className="card mb-8 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">System status</h2>
              <p className="mt-1 text-sm text-muted">
                {health.configured
                  ? "Credentials detected — ready to provision."
                  : "Waiting on Twilio + Vapi keys. Add secrets in Cursor environment setup."}
              </p>
            </div>
            <ShellBadge tone={health.configured ? "live" : "flare"}>
              {health.configured ? "Ready" : "Setup needed"}
            </ShellBadge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {health.config.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>{item.name}</span>
                <span className={item.configured ? "text-live" : "text-ash"}>
                  {item.configured ? "✓" : item.optional ? "optional" : "missing"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Webhook: {health.webhookUrl} · SMS: {health.smsWebhookUrl}
          </p>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold">Add business</h2>

          <FormField label="Business name">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Summit HVAC"
            />
          </FormField>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Owner phone (SMS alerts)">
              <input
                className="input"
                value={form.ownerPhone}
                onChange={(e) =>
                  setForm({ ...form, ownerPhone: e.target.value })
                }
                placeholder="+15551234567"
              />
            </FormField>
            <FormField label="Owner email">
              <input
                className="input"
                type="email"
                value={form.ownerEmail}
                onChange={(e) =>
                  setForm({ ...form, ownerEmail: e.target.value })
                }
                placeholder="owner@company.com"
              />
            </FormField>
          </div>

          <FormField label="Custom greeting">
            <input
              className="input"
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              placeholder="Thanks for calling Summit HVAC..."
            />
          </FormField>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Twilio number (E.164)">
              <input
                className="input"
                value={form.twilioPhone}
                onChange={(e) =>
                  setForm({ ...form, twilioPhone: e.target.value })
                }
                placeholder="+15559876543"
              />
            </FormField>
            <FormField label="Vapi phone number (optional)">
              <input
                className="input"
                value={form.vapiPhoneNumber}
                onChange={(e) =>
                  setForm({ ...form, vapiPhoneNumber: e.target.value })
                }
                placeholder="+15559876543"
              />
            </FormField>
          </div>

          <FormField label="Hours JSON">
            <textarea
              className="input min-h-40 font-mono text-sm"
              value={form.hoursJson}
              onChange={(e) =>
                setForm({ ...form, hoursJson: e.target.value })
              }
            />
          </FormField>

          <FormField label="Services JSON">
            <textarea
              className="input min-h-40 font-mono text-sm"
              value={form.servicesJson}
              onChange={(e) =>
                setForm({ ...form, servicesJson: e.target.value })
              }
            />
          </FormField>

          {error ? (
            <p className="font-sans text-sm text-flare-dim">{error}</p>
          ) : null}
          {success ? (
            <p className="font-sans text-sm text-live">{success}</p>
          ) : null}

          <button disabled={submitting} className="btn btn-primary">
            {submitting ? "Creating..." : "Create business + Vapi assistant"}
          </button>
        </form>

        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Connected businesses</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : businesses.length === 0 ? (
            <p className="text-sm text-muted">
              No businesses yet. Create your first one to provision a Vapi
              assistant.
            </p>
          ) : (
            <ul className="space-y-4">
              {businesses.map((business) => (
                <li
                  key={business.id}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{business.name}</p>
                      <p className="text-sm text-muted">/{business.slug}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(business.id)}
                      className="text-sm text-red-300 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-muted">
                    <div>
                      Assistant:{" "}
                      <span className="font-mono text-foreground">
                        {business.vapiAssistantId ?? "—"}
                      </span>
                    </div>
                    <div>
                      Calls / Leads: {business._count?.calls ?? 0} /{" "}
                      {business._count?.leads ?? 0}
                    </div>
                    <div>
                      Twilio: {business.twilioPhone ?? "Not set"}
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-md border border-rule bg-fog p-4 font-sans text-sm leading-relaxed text-ash">
            <p className="font-medium text-void">Connect phone in Vapi</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Create the business here (generates assistant).</li>
              <li>In Vapi, attach your Twilio number to that assistant.</li>
              <li>Set webhook URL to your deployed `/api/webhooks/vapi`.</li>
              <li>Place a test call and verify lead + owner SMS.</li>
            </ol>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
