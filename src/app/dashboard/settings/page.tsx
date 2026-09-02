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
  } | null;
  line?: string | null;
  health: ShopHealth | null;
  wedge: WedgeReadiness | null;
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
  };
};

export default function DashboardSettingsPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [greeting, setGreeting] = useState("");
  const [avgTicket, setAvgTicket] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

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
  }

  useEffect(() => {
    loadAccount().catch(() => null);
  }, []);

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

  return (
    <OsShell title="Settings" subtitle="Line, greeting, alerts, and avg ticket.">
      <ProPageStrip />

      <ProSetupHub health={account?.health} wedge={account?.wedge} />

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

        <ShellPanel title="Economics">
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
