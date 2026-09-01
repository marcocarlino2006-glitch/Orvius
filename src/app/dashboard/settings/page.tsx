"use client";

import { OsShell } from "@/components/os-shell";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import { useEffect, useState } from "react";

type AccountResponse = {
  business: {
    name: string;
    ownerPhone: string | null;
    greeting: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
  } | null;
};

export default function DashboardSettingsPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [greeting, setGreeting] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data: AccountResponse) => {
        setAccount(data);
        setOwnerPhone(data.business?.ownerPhone ?? "");
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

    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: ownerPhone.trim(),
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
                    greeting: data.business.greeting,
                  }
                : null,
            }
          : prev,
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OsShell title="Settings" subtitle="Your line, greeting, and owner alerts.">
      <ProSignalBar showInboxLink={false} />

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
              Lead summaries text here. Reply STOP to opt out.
            </span>
          </label>
        </ShellPanel>

        {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
        {saved ? (
          <ShellAlert tone="success">Saved. Your receptionist is updated.</ShellAlert>
        ) : null}

        <button type="submit" className="btn btn-void" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </OsShell>
  );
}
