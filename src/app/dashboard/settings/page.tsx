"use client";

import { CaptureSetupPanel } from "@/components/capture-setup-panel";
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
    lastWeeklyProofAt?: string | null;
    founderCertJson?: string | null;
    overflowForwardConfirmedAt?: string | null;
    lineVerifiedAt?: string | null;
    billingStatus?: string;
    pilotEndsAt?: string | null;
  } | null;
  line?: string | null;
  health: ShopHealth | null;
  wedge: WedgeReadiness | null;
  billing?: {
    configured?: boolean;
    entitled?: boolean;
    status?: string;
  };
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
  };
  viewer?: {
    isFounder?: boolean;
  };
};

const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseCert(raw: string | null | undefined): boolean[] {
  const empty = FOUNDER_CERT.map(() => false);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as boolean[];
    if (Array.isArray(parsed) && parsed.length === FOUNDER_CERT.length) {
      return parsed.map(Boolean);
    }
  } catch {
    /* ignore */
  }
  return empty;
}

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
  const [certSaving, setCertSaving] = useState(false);
  const [overflowForward, setOverflowForward] = useState(false);
  const [overflowSaving, setOverflowSaving] = useState(false);

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
    setCertChecks(parseCert(data.business?.founderCertJson));
    setOverflowForward(Boolean(data.business?.overflowForwardConfirmedAt));
  }

  useEffect(() => {
    loadAccount().catch(() => null);
  }, []);

  async function persistCert(next: boolean[]) {
    setCertChecks(next);
    setCertSaving(true);
    try {
      await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ founderCertJson: JSON.stringify(next) }),
      });
      try {
        localStorage.setItem("orvius-founder-cert", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch {
      /* keep UI state */
    } finally {
      setCertSaving(false);
    }
  }

  function toggleCert(index: number) {
    const next = certChecks.map((v, i) => (i === index ? !v : v));
    void persistCert(next);
  }

  const line =
    account?.line ??
    account?.business?.vapiPhoneNumber ??
    account?.business?.twilioPhone ??
    null;

  
  async function saveOverflow(next: boolean) {
    setOverflowSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overflowForwardConfirmedAt: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setOverflowForward(next);
      setAccount((prev) =>
        prev && prev.business
          ? {
              ...prev,
              business: {
                ...prev.business,
                overflowForwardConfirmedAt: next
                  ? new Date().toISOString()
                  : null,
              },
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setOverflowSaving(false);
    }
  }

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
          founderCertJson: JSON.stringify(certChecks),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      setSyncWarning(data.syncWarning ?? null);
      await loadAccount();
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
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setTestResult(data.message ?? "Test alert sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function exportShopData() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
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

  return (
    <OsShell title="Settings" subtitle="Capture, alerts, then the rest.">
      <div className="pro-settings-page">
        <ProPageStrip />

        <ProSetupHub health={account?.health} wedge={account?.wedge} />

        <form className="account-stack pro-settings-form" onSubmit={save}>
        <div id="overflow-forward">
          <ShellPanel title="Call capture" dense>
            <CaptureSetupPanel
              line={line}
              overflowConfirmed={overflowForward}
              lineVerified={Boolean(account?.business?.lineVerifiedAt)}
              saving={overflowSaving}
              onConfirmOverflow={(next) => saveOverflow(next)}
            />
          </ShellPanel>
        </div>

        <ShellPanel title="Owner alerts" dense>
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
                ? "Email failover is live — used when SMS fails or is unavailable."
                : account?.viewer?.isFounder
                  ? "Email failover needs RESEND_API_KEY on the platform. Without it, SMS-only alerts."
                  : "Email backup is not configured on the platform yet. Alerts stay SMS-only until Orvius turns it on."}
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

        <details className="pro-settings-secondary font-sans">
          <summary>Opening line + baseline</summary>
          <div id="economics-baseline" className="pro-settings-secondary-body">
            <label className="onboarding-field font-sans">
              <span className="onboarding-label">Opening line</span>
              <textarea
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="onboarding-textarea"
                rows={3}
                placeholder={`Thank you for calling ${account?.business?.name ?? "your shop"}. How can I help you today?`}
              />
            </label>
            <label className="onboarding-field font-sans mt-4">
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
                Estimates pipeline value on Command — not collected revenue.
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
          </div>
        </details>

        {account?.viewer?.isFounder ? (
          <details id="founder-cert" className="pro-settings-secondary font-sans">
            <summary>
              Founder phone certification ({certDone}/{FOUNDER_CERT.length})
              {certSaving ? " · saving…" : ""}
            </summary>
            <div className="pro-settings-secondary-body">
              <p className="account-settings-hint font-sans mb-3">
                Internal dogfood checklist — not part of the owner go-live ritual.
              </p>
              <ul className="pro-founder-cert-list">
                {FOUNDER_CERT.map((label, index) => (
                  <li key={label}>
                    <label className="pro-founder-cert-item font-sans">
                      <input
                        type="checkbox"
                        checked={certChecks[index] ?? false}
                        onChange={() => toggleCert(index)}
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}

        <details className="pro-settings-secondary font-sans">
          <summary>Your data</summary>
          <div className="pro-settings-secondary-body">
            <p className="account-settings-hint font-sans">
              Download customers, leads, jobs, and money records as JSON.
            </p>
            <button
              type="button"
              className="btn btn-secondary text-sm mt-4"
              disabled={exporting}
              onClick={exportShopData}
            >
              {exporting ? "Preparing export…" : "Export shop data"}
            </button>
          </div>
        </details>

        {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
        {syncWarning ? <ShellAlert tone="error">{syncWarning}</ShellAlert> : null}
        {saved ? (
          <ShellAlert tone="success">Saved. Your receptionist is updated.</ShellAlert>
        ) : null}
        {testResult ? <ShellAlert tone="success">{testResult}</ShellAlert> : null}

        <div className="pro-settings-savebar">
          <p className="pro-settings-savebar-hint font-sans">
            {saving
              ? "Saving your changes…"
              : saved
                ? "All changes saved."
                : "Changes apply to your live receptionist."}
          </p>
          <button type="submit" className="btn btn-void" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
        </form>
      </div>
    </OsShell>
  );
}
