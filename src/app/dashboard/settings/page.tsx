"use client";

import { OsShell } from "@/components/os-shell";
import { ProAlertBanner } from "@/components/pro-alert-banner";
import { ProShopHealth } from "@/components/pro-shop-health";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import type { ShopHealth } from "@/lib/shop-health";
import { useEffect, useState } from "react";

type AccountResponse = {
  business: {
    name: string;
    ownerPhone: string | null;
    ownerEmail: string | null;
    greeting: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
  } | null;
  health: ShopHealth | null;
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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data: AccountResponse) => {
        setAccount(data);
        setOwnerPhone(data.business?.ownerPhone ?? "");
        setOwnerEmail(data.business?.ownerEmail ?? "");
        setGreeting(data.business?.greeting ?? "");
      })
      .catch(() => null);
  }, []);

  const line =
    account?.business?.vapiPhoneNumber ?? account?.business?.twilioPhone ?? null;

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              business: prev.business
                ? {
                    ...prev.business,
                    ownerPhone: data.business.ownerPhone,
                    ownerEmail: data.business.ownerEmail,
                    greeting: data.business.greeting,
                  }
                : null,
            }
          : prev,
      );
      if (data.assistantSynced === false) {
        setSyncWarning(
          data.syncError ??
            "Saved locally, but your AI receptionist did not sync. Try again in a moment.",
        );
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
    <OsShell title="Settings" subtitle="Your line, greeting, and owner alerts.">
      <ProSignalBar showInboxLink={false} />

      {account?.health ? (
        <>
          <ProAlertBanner health={account.health} />
          <ProShopHealth health={account.health} />
        </>
      ) : null}

      <form className="account-stack mt-6" onSubmit={save}>
        <ShellPanel title="Shop line">
          <p className="account-settings-value font-sans text-lg font-semibold text-void">
            {line ?? "Not configured"}
          </p>
          <p className="mt-2 font-sans text-sm text-ash">
            This is the number customers call. Orvius answers and routes leads to your inbox.
          </p>
        </ShellPanel>

        <ShellPanel title="AI greeting">
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={testing}
              onClick={sendTestAlert}
            >
              {testing ? "Sending test…" : "Send test alert"}
            </button>
            <span className="font-sans text-xs text-ash self-center">
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
