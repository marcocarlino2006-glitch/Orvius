"use client";

import { OsShell } from "@/components/os-shell";
import { LiveStatusBar } from "@/components/live-status-bar";
import { FormField, ShellBadge } from "@/components/shell-primitives";
import { AdminSkeleton, SkeletonBar } from "@/components/shell-skeleton";
import {
  fillOutreachTemplate,
  outreachTemplates,
} from "@/lib/outreach-templates";
import Link from "next/link";
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
  billingStatus?: string;
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

const PIPELINE_STATUSES = [
  "new",
  "contacted",
  "demoed",
  "onboarded",
  "live",
  "closed",
] as const;

type Prospect = {
  id: string;
  email: string;
  businessName: string | null;
  phone: string | null;
  trade: string | null;
  city: string | null;
  plan: string;
  status: string;
  notes: string | null;
  nextActionAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
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
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectCounts, setProspectCounts] = useState<Record<string, number>>({});
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [touchesTodayCount, setTouchesTodayCount] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(20);
  const [prospectError, setProspectError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ownerPhone: "",
    ownerEmail: "",
    greeting: "",
    hoursJson: defaultHours,
    servicesJson: defaultServices,
  });

  async function loadProspects() {
    try {
      const res = await fetch("/api/waitlist");
      if (!res.ok) return;
      const data = await res.json();
      setProspects(data.entries ?? []);
      setProspectCounts(data.byStatus ?? {});
      setDueTodayCount(data.dueTodayCount ?? 0);
      setOverdueCount(data.overdueCount ?? 0);
      setTouchesTodayCount(data.touchesTodayCount ?? 0);
      setDailyTarget(data.dailyTarget ?? 20);
    } catch {
      setProspectError("Could not load prospect pipeline");
    }
  }

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
    loadProspects();
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => null);
  }, []);

  async function updateProspect(
    id: string,
    patch: {
      status?: string;
      notes?: string | null;
      lastContactedAt?: string | null;
      nextActionAt?: string | null;
    },
  ) {
    setProspectError(null);
    const res = await fetch("/api/waitlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      setProspectError("Failed to update prospect");
      return;
    }
    await loadProspects();
  }

  async function importProspectCsv(file: File) {
    setImporting(true);
    setImportNote(null);
    setProspectError(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/waitlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Import failed");
      }
      setImportNote(
        `Imported ${data.created} new · updated ${data.updated}` +
          (data.skipped ? ` · skipped ${data.skipped}` : ""),
      );
      await loadProspects();
    } catch (err) {
      setProspectError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

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
        `Created ${data.name}. Dedicated line: ${data.vapiPhoneNumber ?? data.twilioPhone ?? "pending"}`,
      );
      setForm({
        name: "",
        ownerPhone: "",
        ownerEmail: "",
        greeting: "",
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

  if (loading && !health) {
    return (
      <OsShell
        title="Business setup"
        subtitle="Provision a shop, connect the live line, and verify owner alerts."
        statusLabel="Loading"
      >
        <AdminSkeleton />
      </OsShell>
    );
  }

  return (
    <OsShell
      title="Business setup"
      subtitle="Provision a shop, connect the live line, and verify owner alerts."
      statusLabel={health?.configured ? "Ready to provision" : "Setup needed"}
      actions={
        <Link href="/admin/daily" className="btn btn-void text-sm">
          Daily run
        </Link>
      }
    >
      <LiveStatusBar />

      <section className="card mb-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="home-os-kicker">Distribution</p>
            <h2 className="mt-2 font-serif text-xl tracking-[-0.03em] text-void">
              Prospect pipeline
            </h2>
            <p className="mt-2 font-sans text-sm text-ash">
              Due-first board. Daily target {dailyTarget} touches · done today{" "}
              {touchesTodayCount}
              {overdueCount > 0 ? ` · Overdue ${overdueCount}` : ""}
              {dueTodayCount > 0 ? ` · Due today ${dueTodayCount}` : ""}.
            </p>
          </div>
          <ShellBadge
            tone={
              overdueCount > 0 || touchesTodayCount < dailyTarget ? "flare" : "live"
            }
          >
            {touchesTodayCount}/{dailyTarget} touches
          </ShellBadge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 font-sans text-xs text-ash">
          {PIPELINE_STATUSES.map((status) => (
            <span key={status} className="rounded-md border border-rule px-2 py-1">
              {status}: {prospectCounts[status] ?? 0}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {outreachTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-secondary text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(t.body);
                  setCopyNote(`Copied ${t.label}`);
                } catch {
                  setCopyNote("Could not copy");
                }
              }}
            >
              Copy {t.label}
            </button>
          ))}
          <label className="btn btn-void text-xs cursor-pointer">
            {importing ? "Importing…" : "Import CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importProspectCsv(file);
                e.target.value = "";
              }}
            />
          </label>
          <Link href="/admin/daily" className="btn btn-secondary text-xs">
            Daily run
          </Link>
          <Link href="/pilot" className="btn btn-secondary text-xs">
            Pilot page
          </Link>
          <Link href="/demo" className="btn btn-secondary text-xs">
            Demo
          </Link>
        </div>
        {importNote ? (
          <p className="mt-2 font-sans text-xs text-live">{importNote}</p>
        ) : null}
        <p className="mt-2 font-sans text-xs text-ash">
          CSV headers: email, businessName, phone, trade, city — imports as due today.
        </p>
        {copyNote ? (
          <p className="mt-2 font-sans text-xs text-live">{copyNote}</p>
        ) : null}
        {prospectError ? (
          <p className="mt-3 font-sans text-sm text-flare-dim">{prospectError}</p>
        ) : null}
        {prospects.length === 0 ? (
          <div className="mt-5 font-sans text-sm text-ash space-y-3">
            <p>
              Pipeline empty — multi-b distribution is zero until you load owners.
              Target: 20 touches/day from Google Maps, trade groups, warm intros.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-void text-sm cursor-pointer">
                {importing ? "Importing…" : "Import CSV (20/day)"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={importing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importProspectCsv(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Link href="/pilot" className="btn btn-secondary text-sm">
                Open pilot form
              </Link>
              <Link href="/demo" className="btn btn-secondary text-sm">
                Share demo
              </Link>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={async () => {
                  const cold = outreachTemplates.find((t) => t.id === "cold_dm");
                  if (!cold) return;
                  await navigator.clipboard.writeText(cold.body);
                  setCopyNote("Copied cold DM — paste into first outreach");
                }}
              >
                Copy first outreach
              </button>
            </div>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {prospects.slice(0, 40).map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-rule bg-fog/40 p-3 font-sans text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-void">
                      {p.businessName ?? p.email}
                    </p>
                    <p className="text-xs text-ash">
                      {p.email}
                      {p.phone ? ` · ${p.phone}` : ""}
                      {p.trade ? ` · ${p.trade}` : ""}
                      {p.city ? ` · ${p.city}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ash">
                      Next:{" "}
                      {p.nextActionAt
                        ? new Date(p.nextActionAt).toLocaleString()
                        : "not set"}
                      {p.lastContactedAt
                        ? ` · Last touch ${new Date(p.lastContactedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <select
                    className="input text-sm max-w-[10rem]"
                    value={p.status}
                    onChange={(e) =>
                      updateProspect(p.id, { status: e.target.value })
                    }
                    aria-label={`Status for ${p.email}`}
                  >
                    {PIPELINE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={() => {
                      const next = new Date();
                      next.setDate(next.getDate() + 1);
                      next.setHours(9, 0, 0, 0);
                      updateProspect(p.id, {
                        lastContactedAt: new Date().toISOString(),
                        nextActionAt: next.toISOString(),
                        status: p.status === "new" ? "contacted" : p.status,
                      });
                    }}
                  >
                    Logged touch · +1 day
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={() => {
                      const next = new Date();
                      next.setHours(next.getHours() + 2);
                      updateProspect(p.id, {
                        nextActionAt: next.toISOString(),
                      });
                    }}
                  >
                    Follow up in 2h
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={async () => {
                      const body = fillOutreachTemplate(
                        outreachTemplates.find((t) => t.id === "cold_dm")!.body,
                        {
                          name: p.businessName?.split(" ")[0],
                          business: p.businessName ?? undefined,
                        },
                      );
                      try {
                        await navigator.clipboard.writeText(body);
                        setCopyNote(`DM ready for ${p.businessName ?? p.email}`);
                      } catch {
                        setCopyNote("Could not copy");
                      }
                    }}
                  >
                    Copy DM
                  </button>
                </div>
                <input
                  className="input mt-2 text-sm"
                  defaultValue={p.notes ?? ""}
                  placeholder="Notes (blur to save)"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (p.notes ?? "")) {
                      updateProspect(p.id, { notes: next || null });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="home-os-kicker">Pre-post gate</p>
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

          <p className="font-sans text-sm text-ash">
            Each shop gets its own dedicated Twilio number and AI receptionist —
            never the marketing demo line.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Owner mobile (required)">
              <input
                className="input"
                required
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
              placeholder="Thank you for calling your shop name..."
            />
          </FormField>

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

          <button disabled={submitting} className="btn btn-void">
            {submitting ? "Creating..." : "Create business + Vapi assistant"}
          </button>
        </form>

        <section className="card p-6 md:p-7">
          <h2 className="font-sans text-[0.9375rem] font-semibold text-void">
            Connected businesses
          </h2>
          {loading ? (
            <div className="mt-5 space-y-4" aria-busy="true">
              <div className="rounded-md border border-rule bg-fog/40 p-4">
                <SkeletonBar wide className="h-4" />
                <SkeletonBar wide className="mt-3 h-3 max-w-[70%]" />
              </div>
            </div>
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
                    <div>
                      Billing:{" "}
                      <span className="font-medium capitalize text-void">
                        {business.billingStatus ?? "pilot"}
                      </span>
                    </div>
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
    </OsShell>
  );
}
