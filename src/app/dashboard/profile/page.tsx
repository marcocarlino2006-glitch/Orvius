"use client";

import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type AccountResponse = {
  user: { name: string | null; email: string | null };
  business: {
    name: string;
    slug: string;
    timezone?: string | null;
    ownerPhone: string | null;
    ownerEmail: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
    billingStatus: string;
    createdAt: string;
  } | null;
  line?: string | null;
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

/**
 * Profile = identity (Cursor-style).
 * Shop name, owner contact, timezone — not capture ops or founder paste.
 */
export default function DashboardProfilePage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account");
      if (!res.ok) throw new Error("Could not load profile");
      const data = (await res.json()) as AccountResponse;
      setAccount(data);
      setShopName(data.business?.name ?? "");
      setOwnerPhone(data.business?.ownerPhone ?? "");
      setOwnerEmail(data.business?.ownerEmail ?? "");
      setTimezone(data.business?.timezone ?? "America/New_York");
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!account?.business) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: shopName.trim(),
          ownerPhone: ownerPhone.trim(),
          ownerEmail: ownerEmail.trim() || undefined,
          timezone: timezone.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      setDirty(false);
      await load();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const line =
    account?.line ??
    account?.business?.twilioPhone ??
    account?.business?.vapiPhoneNumber ??
    null;

  return (
    <OsShell
      title="Profile"
      subtitle="Who you are in Orvius — shop identity and owner contact."
    >
      <div className="account-grid">
        <ShellPanel title="Sign-in" dense>
          {loading ? (
            <ShellLoading />
          ) : (
            <dl className="os-kv font-sans">
              <div>
                <dt>Name</dt>
                <dd>{account?.user.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{account?.user.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>Google OAuth</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 font-sans text-xs text-ash">
            Sign-in identity comes from Google. Shop contact below is what
            Orvius uses for alerts and proof.
          </p>
        </ShellPanel>

        <ShellPanel
          title="Shop"
          dense
          action={
            <Link href="/dashboard/settings" className="pro-section-link font-sans">
              Settings →
            </Link>
          }
        >
          {loading ? (
            <ShellLoading />
          ) : !account?.business ? (
            <p className="font-sans text-sm leading-relaxed text-ash">
              No shop linked yet.{" "}
              <Link href="/dashboard/onboarding" className="pro-section-link">
                Complete setup
              </Link>{" "}
              to connect your line.
            </p>
          ) : (
            <form className="account-stack" onSubmit={save}>
              <label className="onboarding-field font-sans">
                <span className="onboarding-label">Shop name</span>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => {
                    setShopName(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="onboarding-input"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>

              <label className="onboarding-field font-sans mt-4">
                <span className="onboarding-label">Owner mobile</span>
                <input
                  type="tel"
                  value={ownerPhone}
                  onChange={(e) => {
                    setOwnerPhone(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="onboarding-input"
                  placeholder="+1 555 123 4567"
                  required
                />
                <span className="onboarding-hint">
                  Your cell for night leads — not the shop line.
                </span>
              </label>

              <label className="onboarding-field font-sans mt-4">
                <span className="onboarding-label">Owner email</span>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => {
                    setOwnerEmail(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="onboarding-input"
                  placeholder="you@yourshop.com"
                />
                <span className="onboarding-hint">
                  Weekly proof and email backup land here when Resend is live.
                </span>
              </label>

              <label className="onboarding-field font-sans mt-4">
                <span className="onboarding-label">Timezone</span>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="onboarding-input"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                  {!TIMEZONES.includes(
                    timezone as (typeof TIMEZONES)[number],
                  ) ? (
                    <option value={timezone}>{timezone}</option>
                  ) : null}
                </select>
              </label>

              <dl className="os-kv font-sans mt-5">
                <div>
                  <dt>Live line</dt>
                  <dd className="tabular-nums">{line ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Member since</dt>
                  <dd>
                    {new Date(account.business.createdAt).toLocaleDateString()}
                  </dd>
                </div>
              </dl>

              {error ? (
                <div className="mt-4">
                  <ShellAlert tone="error">{error}</ShellAlert>
                </div>
              ) : null}
              {saved ? (
                <div className="mt-4">
                  <ShellAlert tone="success">Profile saved.</ShellAlert>
                </div>
              ) : null}

              <div className="pro-settings-savebar mt-5">
                <p className="pro-settings-savebar-hint font-sans">
                  {saving
                    ? "Saving…"
                    : saved
                      ? "Saved."
                      : dirty
                        ? "Unsaved identity changes."
                        : "No changes."}
                </p>
                <button
                  type="submit"
                  className="btn btn-void"
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          )}
        </ShellPanel>
      </div>
    </OsShell>
  );
}
