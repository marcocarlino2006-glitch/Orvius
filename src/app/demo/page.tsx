"use client";

import { HomeCallDemo } from "@/components/home-call-demo";
import {
  leadFromDemoForm,
  OwnerAlertCard,
  SectionEyebrow,
} from "@/components/owner-alert-card";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { ProSectionHead } from "@/components/pro-page-chrome";
import {
  FormField,
  ShellAlert,
  ShellPanel,
} from "@/components/shell-primitives";
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

  const previewLead = leadFromDemoForm(form);

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
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Demo"
            title="Call live or simulate in the browser."
            subline="Same product — two ways to experience it."
            description="Start with the live line if you want the real thing. Or run a preset scenario below."
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap demo-pro">
          <div className="demo-pro-grid">
            <div className="demo-pro-main">
              <ProSectionHead kicker="Simulate" title="Run a demo call" />

              <div className="demo-preset-scroll mb-6 flex gap-2 overflow-x-auto pb-1">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setForm(preset)}
                    className={`inst-btn inst-btn-sm shrink-0 ${
                      form.label === preset.label
                        ? "inst-btn-primary"
                        : "inst-btn-ghost"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <form onSubmit={runDemo} className="pro-panel">
                <div className="pro-panel-head">
                  <h2 className="pro-panel-title font-sans">Simulate inbound call</h2>
                </div>
                <div className="pro-panel-body space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Caller name">
                      <input
                        className="input"
                        required
                        value={form.callerName}
                        onChange={(e) =>
                          setForm({ ...form, callerName: e.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="Caller phone">
                      <input
                        className="input"
                        required
                        value={form.callerPhone}
                        onChange={(e) =>
                          setForm({ ...form, callerPhone: e.target.value })
                        }
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Service needed">
                      <input
                        className="input"
                        required
                        value={form.serviceType}
                        onChange={(e) =>
                          setForm({ ...form, serviceType: e.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="Urgency">
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
                    </FormField>
                  </div>

                  <FormField label="Address">
                    <input
                      className="input"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </FormField>

                  <FormField label="Notes">
                    <textarea
                      className="input min-h-24"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </FormField>

                  {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}

                  <button
                    disabled={loading}
                    className="inst-btn inst-btn-primary w-full sm:w-auto"
                  >
                    {loading ? "Running demo call..." : "Simulate call"}
                  </button>
                </div>
              </form>

              {result ? (
                <div className="mt-6">
                  <ShellPanel title="Demo call completed">
                    <p className="font-sans text-sm text-ash">
                      Business: {result.business.name}
                    </p>
                    <p className="mt-3 font-sans text-sm leading-relaxed text-void">
                      {result.summary}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href="/dashboard/inbox"
                        className="inst-btn inst-btn-primary inst-btn-sm w-full sm:w-auto"
                      >
                        Open inbox
                      </Link>
                      <Link
                        href="/dashboard"
                        className="inst-btn inst-btn-ghost inst-btn-sm w-full sm:w-auto"
                      >
                        Command center
                      </Link>
                    </div>
                  </ShellPanel>
                </div>
              ) : null}
            </div>

            <aside className="demo-pro-preview">
              <SectionEyebrow>Owner sees this</SectionEyebrow>
              <OwnerAlertCard
                variant="chalk"
                className="preview-crossfade mt-4 product-float-none shadow-[var(--shadow-lift)]"
                lead={previewLead}
                key={`${form.callerName}-${form.urgency}-${form.serviceType}`}
              />
              <p className="demo-pro-preview-note font-sans">
                Updates live as you edit the form. This is the alert that lands on
                the owner&apos;s phone and dashboard.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
