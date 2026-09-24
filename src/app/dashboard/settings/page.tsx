"use client";

import { CaptureSetupPanel } from "@/components/capture-setup-panel";
import { FounderManusNext } from "@/components/founder-manus-next";
import { ShopSetupChecklistPanel } from "@/components/shop-setup-checklist-panel";
import { DeleteWorkspace } from "@/components/delete-workspace";
import { OperatingMetricsPanel } from "@/components/operating-metrics-panel";
import { OsShell } from "@/components/os-shell";
import { ShellAlert } from "@/components/shell-primitives";
import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import type { ManusPostStep } from "@/lib/manus-post";
import { buildSettingsHub } from "@/lib/settings-hub";
import { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import type { ShopHealth } from "@/lib/shop-health";
import {
  parseHoursForm,
  parseServicesForm,
  parseZipsForm,
  serializeHoursForm,
  serializeServicesForm,
  serializeZipsForm,
  WEEKDAYS,
  weekdayLabel,
  type HoursForm,
} from "@/lib/shop-hours-form";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import { TRADES, type Trade } from "@/lib/trades";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AccountResponse = {
  founder?: boolean;
  business: {
    name: string;
    trade?: string | null;
    address?: string | null;
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
    overflowProvedAt?: string | null;
    forwardGuideSentAt?: string | null;
    captureMode?: CaptureMode | null;
    forwardCarrier?: CarrierId | null;
    lineVerifiedAt?: string | null;
    hoursJson?: string | null;
    servicesJson?: string | null;
    serviceZipsJson?: string | null;
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

const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

const CONTROL_PLANE = [
  { label: "Business", hint: "Name, address, trade", href: "#shop-profile" },
  { label: "Trade rules", hint: "Services, hours, area", href: "#hours-services" },
  { label: "Phone line", hint: "Capture and forwarding", href: "#overflow-forward" },
  { label: "AI behavior", hint: "Opening line, ticket", href: "#economics-baseline" },
  { label: "Alerts", hint: "Owner mobile, email", href: "#owner-alerts" },
  { label: "Team & calendar", hint: "Technicians, schedule", href: "/dashboard/dispatch" },
  { label: "Integrations", hint: "SMS, email, payouts", href: "#integrations" },
  { label: "Billing", hint: "Plan and invoices", href: "/dashboard/billing" },
  { label: "Security & data", hint: "Sign-in, export", href: "#shop-data" },
] as const;

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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [shopName, setShopName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [shopAddress, setShopAddress] = useState("");
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
  const [forwardGuideSent, setForwardGuideSent] = useState(false);
  const [overflowProved, setOverflowProved] = useState(false);
  const [hoursForm, setHoursForm] = useState<HoursForm>(() =>
    parseHoursForm(null),
  );
  const [servicesText, setServicesText] = useState("");
  const [zipsText, setZipsText] = useState("");
  const [manusNext, setManusNext] = useState<ManusPostStep | null>(null);
  const [dirty, setDirty] = useState(false);
  const [crewCount, setCrewCount] = useState<number | null>(null);

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
    setShopName(data.business?.name ?? "");
    setTrade(
      data.business?.trade === "Plumbing" ||
        data.business?.trade === "Electrical"
        ? data.business.trade
        : "HVAC",
    );
    setShopAddress(data.business?.address ?? "");
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
    setForwardGuideSent(Boolean(data.business?.forwardGuideSentAt));
    setOverflowProved(Boolean(data.business?.overflowProvedAt));
    setHoursForm(parseHoursForm(data.business?.hoursJson));
    setServicesText(parseServicesForm(data.business?.servicesJson));
    setZipsText(parseZipsForm(data.business?.serviceZipsJson));
    setDirty(false);
    setLoadState("ready");
  }

  useEffect(() => {
    fetch("/api/technicians")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { technicians?: unknown[] } | null) => {
        if (data?.technicians) setCrewCount(data.technicians.length);
      })
      .catch(() => undefined);
  }, []);

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

  useEffect(() => {
    if (!account?.founder) {
      setManusNext(null);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/mastery")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { manusPost?: { next?: ManusPostStep | null } } | null) => {
        if (cancelled) return;
        setManusNext(data?.manusPost?.next ?? null);
      })
      .catch(() => {
        if (!cancelled) setManusNext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.founder]);

  async function persistCert(next: boolean[]) {
    const previous = certChecks;
    setCertChecks(next);
    setCertSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ founderCertJson: JSON.stringify(next) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCertChecks(previous);
        throw new Error(data.error ?? "Could not save certification");
      }
      try {
        localStorage.setItem("orvius-founder-cert", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save certification");
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
      setOverflowProved(next);
      setAccount((prev) =>
        prev && prev.business
          ? {
              ...prev,
              business: {
                ...prev.business,
                overflowForwardConfirmedAt: next
                  ? new Date().toISOString()
                  : null,
                overflowProvedAt: next ? new Date().toISOString() : null,
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

  function markHoursDirty() {
    setDirty(true);
    setSaved(false);
  }

  function updateDay(
    day: (typeof WEEKDAYS)[number],
    patch: Partial<HoursForm[(typeof WEEKDAYS)[number]]>,
  ) {
    setHoursForm((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
    markHoursDirty();
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
          name: shopName.trim(),
          trade,
          address: shopAddress.trim() || null,
          ownerPhone: ownerPhone.trim(),
          ownerEmail: ownerEmail.trim() || undefined,
          greeting: greeting.trim(),
          hoursJson: serializeHoursForm(hoursForm),
          servicesJson: serializeServicesForm(servicesText),
          serviceZipsJson: serializeZipsForm(zipsText),
          avgTicketCents: avgTicket.trim()
            ? Math.round(Number(avgTicket.replace(/[^0-9.]/g, "")) * 100)
            : null,
          baselineMissedCallsPerWeek: baselineMissed.trim()
            ? Math.round(Number(baselineMissed.replace(/[^0-9.]/g, "")))
            : null,
          baselineJobsPerWeek: baselineJobs.trim()
            ? Math.round(Number(baselineJobs.replace(/[^0-9.]/g, "")))
            : null,
          ...(account?.founder
            ? { founderCertJson: JSON.stringify(certChecks) }
            : {}),
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

  const certDone = certChecks.filter(Boolean).length;

  const setupChecklist = useMemo(
    () =>
      buildShopSetupChecklist({
        name: shopName,
        trade,
        address: shopAddress,
        ownerPhone,
        ownerEmail,
        line: account?.line ?? null,
        lineVerified: Boolean(account?.business?.lineVerifiedAt),
        captureConfirmed: overflowForward,
        hoursJson: serializeHoursForm(hoursForm),
        servicesJson: serializeServicesForm(servicesText),
        serviceZipsJson: serializeZipsForm(zipsText),
        crewCount,
      }),
    [
      crewCount,
      shopName,
      trade,
      shopAddress,
      ownerPhone,
      ownerEmail,
      account?.line,
      account?.business?.lineVerifiedAt,
      overflowForward,
      hoursForm,
      servicesText,
      zipsText,
    ],
  );

  if (loadState !== "ready" || !account) {
    return (
      <OsShell title="Settings" subtitle="The control plane: how Orvius answers, books, and alerts for your shop.">
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

  const hubInput = {
    founder: account.founder,
    lineVerified: Boolean(account.business?.lineVerifiedAt),
    overflowConfirmed: overflowForward,
    ownerPhone,
    ownerEmail,
    avgTicketCents: account.business?.avgTicketCents,
    emailConfigured: account.alerts.emailConfigured,
    ownerSmsOptedOut: account.alerts.ownerSmsOptedOut,
    billingConfigured: account.billing?.configured,
    billingFullyReady: account.billing?.fullyReady,
    certDone,
    certTotal: FOUNDER_CERT.length,
  };
  const hubFocus = buildSettingsHub(hubInput).next?.id ?? null;

  return (
    <OsShell
      title="Settings"
      subtitle="The control plane: how Orvius answers, books, and alerts for your shop."
    >
      <div className="pro-settings-page">
        <ShopSetupChecklistPanel checklist={setupChecklist} />
        <nav className="cp-index font-sans" aria-label="Control plane">
          {CONTROL_PLANE.map((area) => (
            <Link key={area.label} href={area.href} className="cp-link">
              <span className="cp-label">{area.label}</span>
              <span className="cp-hint">{area.hint}</span>
            </Link>
          ))}
        </nav>
        <form className="account-stack pro-settings-form" onSubmit={save}>
        <details
          id="shop-profile"
          className="pro-settings-secondary font-sans"
          open={!setupChecklist.steps.find((s) => s.id === "identity")?.done}
        >
          <summary>Shop profile</summary>
          <div className="pro-settings-secondary-body">
            <p className="account-settings-hint font-sans mb-4">
              Trade drives receptionist language and emergency rules. Address
              and name are what callers hear on the night line.
            </p>
            <label className="block mb-4">
              <span className="label mb-2 block">Business name</span>
              <input
                className="onboarding-input"
                value={shopName}
                onChange={(e) => {
                  setShopName(e.target.value);
                  setDirty(true);
                }}
                required
              />
            </label>
            <fieldset className="mb-4">
              <legend className="label mb-2 block">Trade</legend>
              <div className="onboarding-trade-grid">
                {TRADES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`onboarding-trade ${trade === item ? "is-active" : ""}`}
                    onClick={() => {
                      setTrade(item);
                      setDirty(true);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block mb-2">
              <span className="label mb-2 block">Shop address</span>
              <input
                className="onboarding-input"
                value={shopAddress}
                onChange={(e) => {
                  setShopAddress(e.target.value);
                  setDirty(true);
                }}
                placeholder="1842 Oak Street, Austin TX"
                autoComplete="street-address"
              />
            </label>
          </div>
        </details>

        <details
          id="overflow-forward"
          className="pro-settings-secondary font-sans"
          open
        >
          <summary>Call capture</summary>
          <div className="pro-settings-secondary-body">
            <CaptureSetupPanel
              line={line}
              overflowConfirmed={overflowForward}
              overflowProvedAt={overflowProved}
              forwardGuideSent={forwardGuideSent}
              lineVerified={Boolean(account.business?.lineVerifiedAt)}
              saving={overflowSaving}
              initialMode={account.business?.captureMode ?? "forward"}
              initialCarrier={account.business?.forwardCarrier ?? "verizon"}
              onConfirmOverflow={(next) => saveOverflow(next)}
              onCapturePathChange={(next) => saveCapturePath(next)}
              onForwardGuideSent={() => setForwardGuideSent(true)}
            />
          </div>
        </details>

        <details
          id="hours-services"
          className="pro-settings-secondary font-sans"
          open
        >
          <summary>Hours, services &amp; area</summary>
          <div className="pro-settings-secondary-body">
            <p className="account-settings-hint font-sans mb-4">
              The night line uses these to know when you&apos;re open, what you
              take, and which ZIPs to book. Empty ZIPs = no area filter.
            </p>

            <div className="shop-hours-grid">
              {WEEKDAYS.map((day) => {
                const entry = hoursForm[day];
                return (
                  <div key={day} className="shop-hours-row">
                    <label className="shop-hours-day">
                      <input
                        type="checkbox"
                        checked={!entry.closed}
                        onChange={(e) =>
                          updateDay(day, { closed: !e.target.checked })
                        }
                      />
                      <span>{weekdayLabel(day)}</span>
                    </label>
                    <input
                      type="time"
                      className="onboarding-input shop-hours-time"
                      value={entry.open}
                      disabled={entry.closed}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                      aria-label={`${weekdayLabel(day)} open`}
                    />
                    <span className="shop-hours-sep" aria-hidden>
                      –
                    </span>
                    <input
                      type="time"
                      className="onboarding-input shop-hours-time"
                      value={entry.close}
                      disabled={entry.closed}
                      onChange={(e) =>
                        updateDay(day, { close: e.target.value })
                      }
                      aria-label={`${weekdayLabel(day)} close`}
                    />
                  </div>
                );
              })}
            </div>

            <label className="onboarding-field font-sans mt-5">
              <span className="onboarding-label">Services (one per line)</span>
              <textarea
                value={servicesText}
                onChange={(e) => {
                  setServicesText(e.target.value);
                  markHoursDirty();
                }}
                className="onboarding-textarea"
                rows={4}
                placeholder={"AC repair\nHeating repair\nMaintenance"}
              />
              <span className="onboarding-hint">
                Written into the receptionist&apos;s service list — keep names
                short.
              </span>
            </label>

            <label className="onboarding-field font-sans mt-4">
              <span className="onboarding-label">Service ZIPs</span>
              <input
                type="text"
                value={zipsText}
                onChange={(e) => {
                  setZipsText(e.target.value);
                  markHoursDirty();
                }}
                className="onboarding-input"
                placeholder="33101, 33109, 33139"
                inputMode="numeric"
                autoComplete="off"
              />
              <span className="onboarding-hint">
                Comma-separated. When set, out-of-area leads stay on the board
                — not auto-booked.
              </span>
            </label>
          </div>
        </details>

        <details
          id="owner-alerts"
          className="pro-settings-secondary font-sans"
          open
        >
          <summary>Owner alerts</summary>
          <div className="pro-settings-secondary-body">
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
              Must be your cell — not your shop line. Lead summaries text here.
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
                : account.founder
                  ? "Alerts are text-only until Resend is live — paste keys below."
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

          {!account.alerts.emailConfigured && account.founder ? (
            <div
              id="email-failover"
              className="billing-unblock billing-unblock--instrument mt-4 font-sans"
            >
              <p className="billing-unblock-kicker">Resend gates</p>
              <p className="billing-unblock-title">
                SMS→email failover stays dark until these are green
              </p>
              <ol className="billing-unblock-steps">
                <li>Add RESEND_API_KEY on Vercel</li>
                <li>
                  Set RESEND_FROM to a verified sender (e.g. Orvius
                  &lt;alerts@orvius.im&gt;)
                </li>
                <li>Redeploy · then Send test alert</li>
              </ol>
              <p className="billing-unblock-foot">
                Owners never see this panel — only the founder paste path.
              </p>
            </div>
          ) : null}
          </div>
        </details>

        <details
          id="economics-baseline"
          className="pro-settings-secondary font-sans"
          open
        >
          <summary>Opening line + baseline</summary>
          <div className="pro-settings-secondary-body">
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

        {/*
          The certification is ours, not the shop's — five real calls we place
          before we trust the line overnight. It says so itself ("internal
          dogfood checklist"), and it was sitting in every owner's Settings.
        */}
        {account.founder ? (
          <details
            id="founder-cert"
            className="pro-settings-secondary font-sans"
            open={hubFocus === "cert"}
          >
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

        {account.founder ? (
          <details
            id="manus-post-next"
            className="pro-settings-secondary font-sans"
            open={Boolean(manusNext) && hubFocus == null}
          >
            <summary>Launch checklist · next</summary>
            <FounderManusNext tone="quiet" next={manusNext} />
          </details>
        ) : null}

        <details id="operating-metrics" className="pro-settings-secondary font-sans" open>
          <summary>How the loop is performing · last 30 days</summary>
          <div className="pro-settings-secondary-body">
            <OperatingMetricsPanel />
          </div>
        </details>

        <details id="integrations" className="pro-settings-secondary font-sans" open>
          <summary>Integrations</summary>
          <div className="pro-settings-secondary-body">
            <ul className="int-list">
              <li className="int-row">
                <span className={`int-dot ${line ? "is-on" : ""}`} aria-hidden />
                <span className="int-copy">
                  <span className="int-name">Phone line</span>
                  <span className="int-detail">{line ? `Connected · ${line}` : "Not connected"}</span>
                </span>
              </li>
              <li className="int-row">
                <span className={`int-dot ${account.alerts.smsEnabled && !account.alerts.ownerSmsOptedOut ? "is-on" : ""}`} aria-hidden />
                <span className="int-copy">
                  <span className="int-name">SMS alerts</span>
                  <span className="int-detail">
                    {account.alerts.ownerSmsOptedOut
                      ? "Owner number opted out — text START to resume"
                      : account.alerts.smsEnabled
                        ? "Connected"
                        : "Not connected"}
                  </span>
                </span>
              </li>
              <li className="int-row">
                <span className={`int-dot ${account.alerts.emailConfigured ? "is-on" : ""}`} aria-hidden />
                <span className="int-copy">
                  <span className="int-name">Email backup</span>
                  <span className="int-detail">{account.alerts.emailConfigured ? "Connected" : "Not connected"}</span>
                </span>
              </li>
              <li className="int-row">
                <span className={`int-dot ${account.billing?.fullyReady ? "is-on" : ""}`} aria-hidden />
                <span className="int-copy">
                  <span className="int-name">Payments &amp; payouts</span>
                  <span className="int-detail">
                    {account.billing?.fullyReady ? "Connected" : "Set up on Billing"}
                  </span>
                </span>
                <Link href="/dashboard/billing#payouts" className="int-action">
                  Open
                </Link>
              </li>
              <li className="int-row">
                <span className="int-dot" aria-hidden />
                <span className="int-copy">
                  <span className="int-name">External calendar</span>
                  <span className="int-detail">
                    Not available yet — jobs book onto the Orvius schedule in Dispatch.
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </details>

        {/*
          Billing's home is /dashboard/billing. Settings only points there —
          a second money panel on the setup hub is theater.
        */}
        <details className="pro-settings-secondary font-sans" open={hubFocus === "billing"}>
          <summary>Plan & billing</summary>
          <div className="pro-settings-secondary-body">
            <p className="account-settings-hint font-sans">
              Plan, payment method, payouts, and deposits live on Billing. The
              plan name also sits on the profile button in the corner.
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
            {account?.business?.name ? <DeleteWorkspace workspaceName={account.business.name} /> : null}
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
