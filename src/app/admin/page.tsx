"use client";

import { AppShell } from "@/components/app-shell";
import { LiveStatusBar } from "@/components/live-status-bar";
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
  twilioPhone: string | null;
  ownerSmsEnabled: boolean;
  ownerPhoneIsTwilioLine?: boolean;
  ownerSmsReachable?: boolean;
  webhookUrl: string;
  smsWebhookUrl: string;
  stats: { businessCount: number; leadCount: number; callCount: number };
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
  const [ownerEdits, setOwnerEdits] = useState<Record<string, string>>({});
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
      setOwnerEdits(
        Object.fromEntries(
          data.map((b: Business) => [b.id, b.ownerPhone ?? ""]),
        ),
      );
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

  async function saveOwnerPhone(id: string) {
    setError(null);
    const res = await fetch("/api/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ownerPhone: ownerEdits[id] }),
    });
    if (!res.ok) {
      setError("Failed to update owner phone");
      return;
    }
    setSuccess("Owner phone updated — SMS alerts will use this number.");
    await loadBusinesses();
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

  const checklist = [
    {
      label: "Twilio + Vapi credentials",
      done: health?.configured ?? false,
    },
    {
      label: "Business provisioned",
      done: (health?.stats.businessCount ?? 0) > 0,
    },
    {
      label: "Owner SMS reachable",
      done:
        (health?.ownerSmsReachable ?? false) &&
        !(health?.ownerPhoneIsTwilioLine ?? false),
    },
    {
      label: "At least one lead captured",
      done: (health?.stats.leadCount ?? 0) > 0,
    },
  ];

  return (
    <AppShell
      title="Business setup"
      subtitle="Provision a shop, connect the live line, and verify owner alerts."
      statusLabel={health?.configured ? "Ready to provision" : "Setup needed"}
    >
      <LiveStatusBar />

      <section className="card mb-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Pre-post gate</p>
            <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">
              Go-live checklist
            </h2>
          </div>
          <ShellBadge tone={checklist.every((c) => c.done) ? "live" : "flare"}>
            {checklist.filter((c) => c.done).length}/{checklist.length}
          </ShellBadge>
        </div>
        <ul className="mt-5 space-y-2">
          {checklist.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between rounded-md border border-rule px-3 py-2.5 font-sans text-sm"
            >
              <span className="text-void">{item.label}</span>
              <span className={item.done ? "text-live font-medium" : "text-ash"}>
                {item.done ? "Done" : "Open"}
              </span>
            </li>
          ))}
        </ul>
        {health ? (
          <p className="mt-4 font-sans text-xs leading-relaxed text-ash">
            Webhook: {health.webhookUrl} · SMS: {health.smsWebhookUrl}
          </p>
        ) : null}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="card space-y-4 p-6 md:p-7">
          <h2 className="font-sans text-[0.9375rem] font-semibold text-void">
            Add business
          </h2>

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

        <section className="card p-6 md:p-7">
          <h2 className="font-sans text-[0.9375rem] font-semibold text-void">
            Connected businesses
          </h2>
          {loading ? (
            <p className="mt-4 font-sans text-sm text-ash">Loading...</p>
          ) : businesses.length === 0 ? (
            <p className="mt-4 font-sans text-sm text-ash">
              No businesses yet. Create your first one to provision a Vapi
              assistant.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {businesses.map((business) => (
                <li
                  key={business.id}
                  className="rounded-md border border-rule bg-fog/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-sans text-sm font-semibold text-void">
                        {business.name}
                      </p>
                      <p className="font-sans text-xs text-ash">/{business.slug}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(business.id)}
                      className="font-sans text-xs text-flare-dim hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <dl className="mt-3 space-y-1 font-sans text-xs text-ash">
                    <div>
                      Calls / Leads: {business._count?.calls ?? 0} /{" "}
                      {business._count?.leads ?? 0}
                    </div>
                    <div>Twilio: {business.twilioPhone ?? "Not set"}</div>
                  </dl>
                  <div className="mt-4 flex gap-2">
                    <input
                      className="input text-sm"
                      value={ownerEdits[business.id] ?? ""}
                      onChange={(e) =>
                        setOwnerEdits({
                          ...ownerEdits,
                          [business.id]: e.target.value,
                        })
                      }
                      placeholder="+1 owner phone for SMS"
                    />
                    <button
                      type="button"
                      onClick={() => saveOwnerPhone(business.id)}
                      className="btn btn-secondary shrink-0 text-sm"
                    >
                      Save
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-md border border-rule bg-white p-4 font-sans text-sm leading-relaxed text-ash">
            <p className="font-medium text-void">Test before you post</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Call your live Twilio number from your phone.</li>
              <li>Confirm lead appears in /dashboard.</li>
              <li>Confirm owner SMS arrives within 30 seconds.</li>
              <li>Deploy to Vercel and update Vapi webhook URL.</li>
            </ol>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
