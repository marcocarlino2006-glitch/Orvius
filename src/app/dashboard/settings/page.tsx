"use client";

import { CaptureSetupPanel } from "@/components/capture-setup-panel";
import { SettingsLaunchGuide } from "@/components/settings-launch-guide";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import { useEffect, useState } from "react";
import Link from "next/link";

type AccountResponse = {
  founder?: boolean;
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
    overflowForwardConfirmedAt?: string | null;
    captureMode?: CaptureMode | null;
    forwardCarrier?: CarrierId | null;
    lineVerifiedAt?: string | null;
    billingStatus?: string;
    pilotEndsAt?: string | null;
  } | null;
  line?: string | null;
  health: ShopHealth | null;
  wedge: WedgeReadiness | null;
  billing?: {
    configured?: boolean;
    fullyReady?: boolean;
    entitled?: boolean;
    status?: string;
  };
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
    ownerSmsOptedOut?: boolean;
  };
};

/**
 * Owner Settings — product behavior only.
 * Profile = identity. Billing = money. /admin/ops = founder paste (Manus/Resend/cert).
 */
export default function DashboardSettingsPage() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
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
  const [overflowForward, setOverflowForward] = useState(false);
  const [overflowSaving, setOverflowSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function loadAccount() {
    setLoadState("loading");
    setError(null);
    const res = await fetch("/api/account");
    if (!res.ok) {
      setLoadState("error");
      setError("Could not load settings. Refresh and try again.");
      return;
    }
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
    setOverflowForward(Boolean(data.business?.overflowForwardConfirmedAt));
    setDirty(false);
    setLoadState("ready");
  }

  useEffect(() => {
    loadAccount().catch(() => {
      setLoadState("error");
      setError("Could not load settings. Refresh and try again.");
    });
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (loadState !== "ready" || !account) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loadState, account]);

  const line =
    account?.line ??
    account?.business?.vapiPhoneNumber ??
    account?.business?.twilioPhone ??
    null;

  async function saveCapturePath(next: {
    mode: CaptureMode;
    carrier: CarrierId | null;
  }) {
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captureMode: next.mode,
        forwardCarrier: next.carrier,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not save capture path");
    setAccount((prev) =>
      prev && prev.business
        ? {
            ...prev,
            business: {
              ...prev.business,
              captureMode: next.mode,
              forwardCarrier: next.carrier,
            },
          }
        : prev,
    );
  }

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      setDirty(false);
      setSyncWarning(data.syncWarning ?? null);
      await loadAccount();
      setSaved(true);
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
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      if (!data.ok) {
        throw new Error(
          data.error ??
            "Alert queued but not delivered. Check owner mobile/email and Settings.",
        );
      }
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

  if (loadState !== "ready" || !account) {
    return (
      <OsShell title="Settings" subtitle="Capture, alerts, baselines — then Command.">
        <div className="pro-settings-page">
          {loadState === "error" ? (
            <div className="pro-settings-load-error">
              <ShellAlert tone="error">
                {error ?? "Could not load settings."}
              </ShellAlert>
              <button
                type="button"
                className="btn btn-void text-sm mt-4"
                onClick={() => void loadAccount()}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="pro-settings-load-skel" aria-busy="true">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          )}
        </div>
      </OsShell>
    );
  }

  return (
    <OsShell title="Settings" subtitle="Capture, alerts, baselines — then Command.">
      <div className="pro-settings-page">
        <SettingsLaunchGuide
          input={{
            lineVerified: Boolean(account.business?.lineVerifiedAt),
            overflowConfirmed: overflowForward,
            ownerPhone,
            ownerEmail,
            shopName: account.business?.name,
            avgTicketCents: account.business?.avgTicketCents,
            ownerSmsOptedOut: account.alerts.ownerSmsOptedOut,
            billingConfigured: account.billing?.configured,
          }}
        />
        <form className="account-stack pro-settings-form" onSubmit={save}>
        <div id="overflow-forward">
          <ShellPanel title="Call capture" dense>
            <CaptureSetupPanel
              line={line}
              overflowConfirmed={overflowForward}
              lineVerified={Boolean(account.business?.lineVerifiedAt)}
              saving={overflowSaving}
              initialMode={account.business?.captureMode ?? "forward"}
              initialCarrier={account.business?.forwardCarrier ?? "verizon"}
              onConfirmOverflow={(next) => saveOverflow(next)}
              onCapturePathChange={(next) => saveCapturePath(next)}
            />
          </ShellPanel>
        </div>

        <div id="owner-alerts">
        <ShellPanel title="Owner alerts" dense>
          {account.alerts.ownerSmsOptedOut ? (
            <div className="mb-4">
              <ShellAlert tone="error">
                This number texted STOP — night leads will not reach you. Text{" "}
                <strong>START</strong> to the shop alert number from your cell,
                then send a test alert below.
              </ShellAlert>
            </div>
          ) : null}
          <label className="onboarding-field font-sans">
            <span className="onboarding-label">Your mobile</span>
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
            />
            <span className="onboarding-hint">
              Must be your cell — not your shop line. Also editable on{" "}
              <Link href="/dashboard/profile" className="pro-section-link">
                Profile
              </Link>
              .
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
              {account.alerts.emailConfigured
                ? "Email backup is on — used when a text alert can’t deliver."
                : "Alerts come by text only right now. Email backup switches on from our side — nothing for you to set up."}
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
              SMS{" "}
              {account.alerts.ownerSmsOptedOut
                ? "opted out"
                : account.alerts.smsEnabled
                  ? "enabled"
                  : "off"}{" "}
              · Email {account.alerts.emailConfigured ? "on" : "off"}
            </span>
          </div>
        </ShellPanel>
        </div>

        <details className="pro-settings-secondary font-sans">
          <summary>Opening line + baseline</summary>
          <div id="economics-baseline" className="pro-settings-secondary-body">
            <label className="onboarding-field font-sans">
              <span className="onboarding-label">Opening line</span>
              <textarea
                value={greeting}
                onChange={(e) => {
                  setGreeting(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
                className="onboarding-textarea"
                rows={3}
                placeholder={`Thank you for calling ${account.business?.name ?? "your shop"}. How can I help you today?`}
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
                onChange={(e) => {
                  setAvgTicket(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
                className="onboarding-input"
                placeholder="285"
              />
              <span className="onboarding-hint">
                Used to estimate booked value on Command — not money collected.
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
                  onChange={(e) => {
                    setBaselineMissed(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
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
                  onChange={(e) => {
                    setBaselineJobs(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="onboarding-input"
                  placeholder="8"
                />
              </label>
            </div>
          </div>
        </details>

        <details className="pro-settings-secondary font-sans">
          <summary>Plan & billing</summary>
          <div className="pro-settings-secondary-body">
            <p className="account-settings-hint font-sans">
              Plan, payment method, payouts, and deposits live on Billing.
              Shop identity lives on{" "}
              <Link href="/dashboard/profile" className="pro-section-link">
                Profile
              </Link>
              .
            </p>
            <Link href="/dashboard/billing" className="btn btn-secondary text-sm mt-4">
              Open billing
            </Link>
          </div>
        </details>

        <details id="shop-data" className="pro-settings-secondary font-sans">
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
          <ShellAlert tone="success">Saved. Your night line is updated.</ShellAlert>
        ) : null}
        {testResult ? <ShellAlert tone="success">{testResult}</ShellAlert> : null}

        <div className="pro-settings-savebar">
          <p className="pro-settings-savebar-hint font-sans">
            {saving
              ? "Saving your changes…"
              : saved
                ? "All changes saved."
                : dirty
                  ? "Unsaved — applies to your live night line."
                  : "No changes."}
          </p>
          <button
            type="submit"
            className="btn btn-void"
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
        </form>
      </div>
    </OsShell>
  );
}
