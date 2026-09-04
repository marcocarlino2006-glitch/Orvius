"use client";

import { OsShell } from "@/components/os-shell";
import { ProPageStrip } from "@/components/pro-page-strip";
import { ProSetupHub } from "@/components/pro-setup-hub";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import { useEffect, useState } from "react";

type AccountResponse = {
  business: {
    name: string;
    ownerPhone: string | null;
    ownerEmail: string | null;
    greeting: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
    avgTicketCents: number | null;
    baselineMissedCallsPerWeek: number | null;
    baselineJobsPerWeek: number | null;
  } | null;
  line?: string | null;
  health: ShopHealth | null;
  wedge: WedgeReadiness | null;
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
  };
};

const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

export default function DashboardSettingsPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [greeting, setGreeting] = useState("");
  const [avgTicket, setAvgTicket] = useState("");
  const [baselineMissed, setBaselineMissed] = useState("");
  const [baselineJobs, setBaselineJobs] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [certChecks, setCertChecks] = useState<boolean[]>(() =>
    FOUNDER_CERT.map(() => false),
  );

  async function loadAccount() {
    const res = await fetch("/api/account");
    if (!res.ok) return;
    const data = (await res.json()) as AccountResponse;
    setAccount(data);
    setOwnerPhone(data.business?.ownerPhone ?? "");
    setOwnerEmail(data.business?.ownerEmail ?? "");
    setGreeting(data.business?.greeting ?? "");
    setAvgTicket(
      data.business?.avgTicketCents
        ? String(Math.round(data.business.avgTicketCents / 100))
        : "",
    );
    setBaselineMissed(
      data.business?.baselineMissedCallsPerWeek != null
        ? String(data.business.baselineMissedCallsPerWeek)
        : "",
    );
    setBaselineJobs(
      data.business?.baselineJobsPerWeek != null
        ? String(data.business.baselineJobsPerWeek)
        : "",
    );
  }

  useEffect(() => {
    loadAccount().catch(() => null);
    try {
      const raw = localStorage.getItem("orvius-founder-cert");
      if (raw) {
        const parsed = JSON.parse(raw) as boolean[];
        if (Array.isArray(parsed) && parsed.length === FOUNDER_CERT.length) {
          setCertChecks(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCert(index: number) {
    setCertChecks((prev) => {
      const next = prev.map((v, i) => (i === index ? !v : v));
      try {
        localStorage.setItem("orvius-founder-cert", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const line =
    account?.line ??
    account?.business?.vapiPhoneNumber ??
    account?.business?.twilioPhone ??
    null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    setSyncWarning(null);

    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: ownerPhone.trim(),
          ownerEmail: ownerEmail.trim() || undefined,
          greeting: greeting.trim(),
          avgTicketCents: avgTicket.trim()
            ? Math.round(Number(avgTicket.replace(/[^0-9.]/g, "")) * 100)
            : null,
          baselineMissedCallsPerWeek: baselineMissed.trim()
            ? Math.round(Number(baselineMissed.replace(/[^0-9.]/g, "")))
            : null,
          baselineJobsPerWeek: baselineJobs.trim()
            ? Math.round(Number(baselineJobs.replace(/[^0-9.]/g, "")))
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      await loadAccount();

      if (data.assistantSynced === false) {
        setSyncWarning(
          data.syncError ?? "Saved, but your AI receptionist did not update.",
        );
      } else if (data.syncWarning) {
        setSyncWarning(data.syncWarning);
        setSaved(true);
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestAlert() {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test alert failed");

      const parts = [
        data.sms?.status === "sent" ? "SMS sent" : null,
        data.email?.status === "sent" ? "Email sent" : null,
        data.sms?.status === "skipped" ? "SMS skipped" : null,
        data.email?.status === "skipped" ? "Email skipped" : null,
        data.sms?.status === "failed" ? `SMS failed: ${data.sms.error}` : null,
        data.email?.status === "failed"
          ? `Email failed: ${data.email.error}`
          : null,
      ].filter(Boolean);

      setTestResult(
        data.ok
          ? `Test alert delivered. ${parts.join(" · ")}`
          : `Alert did not deliver. ${parts.join(" · ")}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test alert failed");
    } finally {
      setTesting(false);
    }
  }

  async function exportShopData() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "orvius-export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const certDone = certChecks.filter(Boolean).length;
  const wedgeReady = account?.wedge?.ready === true;

  return (
    <OsShell title="Settings" subtitle="Line, alerts, baseline economics, export.">
      <ProPageStrip />

      <ProSetupHub health={account?.health} wedge={account?.wedge} />

      <ShellPanel title="Founder phone certification">
        <p className="account-settings-hint font-sans">
          Call your shop line from your cell. Check each scenario when it passes.
          Wedge gate: {wedgeReady ? "ready" : "not ready"} · Cert {certDone}/
          {FOUNDER_CERT.length}.
        </p>
        <ul className="mt-4 space-y-2 font-sans text-sm">
          {FOUNDER_CERT.map((label, index) => (
            <li key={label} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={certChecks[index]}
                onChange={() => toggleCert(index)}
                className="mt-1"
                aria-label={label}
              />
              <span className={certChecks[index] ? "text-ash line-through" : "text-void"}>
                {label}
              </span>
            </li>
          ))}
        </ul>
      </ShellPanel>

      <form className="account-stack pro-settings-form" onSubmit={save}>
        <ShellPanel title="Your dedicated line">
          <p className="account-settings-value font-sans">
            {line ?? "Assigning your number…"}
          </p>
          <p className="account-settings-hint font-sans">
            Auto-generated for {account?.business?.name ?? "your shop"}. Customers
            call this number — Orvius answers as your business.
          </p>
        </ShellPanel>

        <ShellPanel title="Economics + baseline">
          <label className="onboarding-field font-sans">
            <span className="onboarding-label">Average ticket ($)</span>
            <input
              type="number"
              min={50}
              max={50000}
              step={1}
              value={avgTicket}
              onChange={(e) => setAvgTicket(e.target.value)}
              className="onboarding-input"
              placeholder="285"
            />
            <span className="onboarding-hint">
              Used to estimate pipeline value on Command — not collected revenue.
            </span>
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="onboarding-field font-sans">
              <span className="onboarding-label">Missed calls / week before Orvius</span>
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={baselineMissed}
                onChange={(e) => setBaselineMissed(e.target.value)}
                className="onboarding-input"
                placeholder="12"
              />
            </label>
            <label className="onboarding-field font-sans">
              <span className="onboarding-label">Jobs booked / week before Orvius</span>
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={baselineJobs}
                onChange={(e) => setBaselineJobs(e.target.value)}
                className="onboarding-input"
                placeholder="8"
              />
            </label>
          </div>
          <p className="onboarding-hint font-sans mt-2">
            Owner-reported baseline. Command shows lift vs these numbers — proof for design
            partners, not vanity homepage stats.
          </p>
        </ShellPanel>

        <ShellPanel title="AI receptionist">
          <p className="account-settings-hint font-sans">
            Opening line callers hear when they dial your shop.
          </p>
          <label className="onboarding-field font-sans mt-4">
            <span className="onboarding-label">Opening line</span>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="onboarding-textarea"
              rows={3}
              placeholder={`Thank you for calling ${account?.business?.name ?? "your shop"}. How can I help you today?`}
            />
          </label>
        </ShellPanel>

        <ShellPanel title="Owner alerts">
          <label className="onboarding-field font-sans">
            <span className="onboarding-label">Your mobile</span>
            <input
              type="tel"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="onboarding-input"
              placeholder="+1 555 123 4567"
            />
            <span className="onboarding-hint">
              Must be your cell — not your shop line. Lead summaries text here.
            </span>
          </label>

          <label className="onboarding-field font-sans mt-4">
            <span className="onboarding-label">Owner email</span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="onboarding-input"
              placeholder="you@yourshop.com"
            />
            <span className="onboarding-hint">
              {account?.alerts.emailConfigured
                ? "Email backup when SMS fails or is unavailable."
                : "Email backup requires RESEND_API_KEY on the platform."}
            </span>
          </label>

          <div className="pro-settings-test-row">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={testing}
              onClick={sendTestAlert}
            >
              {testing ? "Sending test…" : "Send test alert"}
            </button>
            <span className="pro-settings-test-meta font-sans">
              SMS {account?.alerts.smsEnabled ? "enabled" : "off"} · Email{" "}
              {account?.alerts.emailConfigured ? "ready" : "not configured"}
            </span>
          </div>
        </ShellPanel>

        <ShellPanel title="Your data">
          <p className="account-settings-hint font-sans">
            Download customers, leads, jobs, and money records as JSON. You own this data —
            export builds trust and still keeps daily history in Orvius.
          </p>
          <button
            type="button"
            className="btn btn-secondary text-sm mt-4"
            disabled={exporting}
            onClick={exportShopData}
          >
            {exporting ? "Preparing export…" : "Export shop data"}
          </button>
        </ShellPanel>

        {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
        {syncWarning ? <ShellAlert tone="error">{syncWarning}</ShellAlert> : null}
        {saved ? (
          <ShellAlert tone="success">Saved. Your receptionist is updated.</ShellAlert>
        ) : null}
        {testResult ? <ShellAlert tone="success">{testResult}</ShellAlert> : null}

        <button type="submit" className="btn btn-void" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </OsShell>
  );
}
