"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BillingContent } from "@/components/billing-content";
import { CaptureSetupPanel } from "@/components/capture-setup-panel";
import { OperatingMetricsPanel } from "@/components/operating-metrics-panel";
import { OrviusLogo } from "@/components/orvius-logo";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { fetchAccount, invalidateAccount } from "@/lib/account-client";
import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import { displayPhone } from "@/lib/customer";
import type { ManusPostStep } from "@/lib/manus-post";
import { useOptionalRing1 } from "@/lib/ring1-context";
import { SETTINGS_SECTIONS, searchSettings, type SettingsSectionId } from "@/lib/settings-center";
import {
  parseHoursForm,
  serializeHoursForm,
  WEEKDAYS,
  type HoursForm,
} from "@/lib/shop-hours-form";
import { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import type { Trade } from "@/lib/trades";
import { SettingsIcon } from "./settings-icons";
import { ScGroup, ScRow } from "./settings-primitives";
import { FOUNDER_CERT, parseCert, type Account, type Patch, type Technician } from "./settings-model";
import { AccountSection } from "./sections/account-section";
import { BusinessSection } from "./sections/business-section";
import { DataSection } from "./sections/data-section";
import { HoursSection } from "./sections/hours-section";
import { IntegrationsSection } from "./sections/integrations-section";
import { InternalSection } from "./sections/internal-section";
import { NotificationsSection } from "./sections/notifications-section";
import { ReceptionistSection } from "./sections/receptionist-section";
import { TeamSection } from "./sections/team-section";

const GROUP_LABELS: Record<string, string | null> = {
  you: null,
  shop: "Shop",
  workspace: "Workspace",
  founder: "Founder",
};

export function SettingsCenter({
  section,
  onSection,
  onClose,
}: {
  section: SettingsSectionId;
  onSection: (next: SettingsSectionId) => void;
  onClose: () => void;
}) {
  const ring1 = useOptionalRing1();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [crew, setCrew] = useState<Technician[] | null>(null);
  const [hours, setHours] = useState<HoursForm>(() => parseHoursForm(null));
  const [certChecks, setCertChecks] = useState<boolean[]>(() => FOUNDER_CERT.map(() => false));
  const [manusNext, setManusNext] = useState<ManusPostStep | null>(null);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pane, setPane] = useState<"nav" | "pane">("pane");
  const dialogRef = useRef<HTMLDivElement>(null);
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetchAccount();
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Account;
      setAccount(data);
      setHours(parseHoursForm(data.business?.hoursJson));
      setCertChecks(parseCert(data.business?.founderCertJson));
    } catch {
      setLoadError("Could not load settings.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/technicians")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { technicians?: Technician[] } | null) => setCrew(data?.technicians ?? []))
      .catch(() => setCrew([]));
  }, [load]);

  useEffect(() => {
    if (!account?.founder) return;
    let cancelled = false;
    fetch("/api/admin/mastery")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { manusPost?: { next?: ManusPostStep | null } } | null) => {
        if (!cancelled) setManusNext(data?.manusPost?.next ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [account?.founder]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [section]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const patch = useCallback(async (fields: Patch): Promise<boolean> => {
    setSaveState("saving");
    setError(null);
    try {
      invalidateAccount();
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        syncWarning?: string | null;
        business?: Partial<NonNullable<Account["business"]>>;
      };
      if (!res.ok) throw new Error(data.error ?? "That did not save. Nothing changed.");
      setAccount((prev) =>
        prev && prev.business ? { ...prev, business: { ...prev.business, ...(fields as object) } } : prev,
      );
      if (data.syncWarning) setNotice(data.syncWarning);
      setSaveState("saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Nothing changed.");
      setSaveState("idle");
      return false;
    }
  }, []);

  function updateDay(day: (typeof WEEKDAYS)[number], change: Partial<HoursForm[(typeof WEEKDAYS)[number]]>) {
    setHours((prev) => {
      const next = { ...prev, [day]: { ...prev[day], ...change } };
      if (hoursTimer.current) clearTimeout(hoursTimer.current);
      hoursTimer.current = setTimeout(() => void patch({ hoursJson: serializeHoursForm(next) }), 700);
      return next;
    });
  }

  async function toggleCert(index: number) {
    const previous = certChecks;
    const next = certChecks.map((v, i) => (i === index ? !v : v));
    setCertChecks(next);
    if (!(await patch({ founderCertJson: JSON.stringify(next) }))) setCertChecks(previous);
  }

  async function saveOverflow(next: boolean) {
    const ok = await patch({ overflowForwardConfirmedAt: next });
    if (ok) {
      const stamp = next ? new Date().toISOString() : null;
      setAccount((prev) =>
        prev && prev.business
          ? {
              ...prev,
              business: { ...prev.business, overflowForwardConfirmedAt: stamp, overflowProvedAt: stamp },
            }
          : prev,
      );
    }
  }

  async function saveCapturePath(next: { mode: CaptureMode; carrier: CarrierId | null }) {
    const ok = await patch({ captureMode: next.mode, forwardCarrier: next.carrier });
    if (!ok) throw new Error("Could not save capture path");
  }

  async function sendTestAlert() {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = (await res.json()) as { error?: string; ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Alert queued but not delivered. Check your mobile number.");
      setNotice(data.message ?? "Test alert sent.");
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
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "orvius-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const b = account?.business ?? null;
  const line = account?.line ?? b?.vapiPhoneNumber ?? b?.twilioPhone ?? null;

  const checklist = useMemo(
    () =>
      buildShopSetupChecklist({
        name: b?.name ?? "",
        trade: (b?.trade as Trade | null) ?? "HVAC",
        address: b?.address ?? "",
        ownerPhone: b?.ownerPhone ?? "",
        ownerEmail: b?.ownerEmail ?? "",
        line: account?.line ?? null,
        lineVerified: Boolean(b?.lineVerifiedAt),
        captureConfirmed: Boolean(b?.overflowForwardConfirmedAt),
        hoursJson: serializeHoursForm(hours),
        servicesJson: b?.servicesJson ?? null,
        serviceZipsJson: b?.serviceZipsJson ?? null,
        crewCount: crew?.length ?? null,
      }),
    [account?.line, b, crew, hours],
  );

  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== "internal" || account?.founder);
  const results = searchSettings(query).filter((r) => sections.some((s) => s.id === r.section));
  const current = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  const name = account?.user?.name ?? b?.name ?? "Owner";
  const email = account?.user?.email ?? b?.ownerEmail ?? "";

  function go(next: SettingsSectionId) {
    onSection(next);
    setPane("pane");
  }

  function renderSection() {
    if (!account || !b) return null;
    switch (section) {
      case "account":
        return <AccountSection account={account} b={b} name={name} email={email} checklist={checklist} go={go} />;

      case "business":
        return <BusinessSection b={b} patch={patch} />;

      case "phone":
        return (
          <div id="overflow-forward">
            <ScGroup>
              <ScRow
                label="Your Orvius line"
                hint={`Forward missed calls here, or publish it as your main shop number. ${
                  b.lineVerifiedAt ? "Verified with a test call." : "Not verified with a test call yet."
                }`}
              >
                <span className="sc-value sc-mono">{line ? displayPhone(line) : "Not connected"}</span>
              </ScRow>
            </ScGroup>
            <ScGroup title="Forwarding">
              <div className="sc-embed">
                <CaptureSetupPanel
                  line={line}
                  overflowConfirmed={Boolean(b.overflowForwardConfirmedAt)}
                  overflowProvedAt={Boolean(b.overflowProvedAt)}
                  forwardGuideSent={Boolean(b.forwardGuideSentAt)}
                  lineVerified={Boolean(b.lineVerifiedAt)}
                  saving={saveState === "saving"}
                  initialMode={b.captureMode ?? "forward"}
                  initialCarrier={b.forwardCarrier ?? "verizon"}
                  onConfirmOverflow={(next) => saveOverflow(next)}
                  onCapturePathChange={(next) => saveCapturePath(next)}
                  onForwardGuideSent={() =>
                    setAccount((prev) =>
                      prev && prev.business
                        ? { ...prev, business: { ...prev.business, forwardGuideSentAt: new Date().toISOString() } }
                        : prev,
                    )
                  }
                />
              </div>
            </ScGroup>
          </div>
        );

      case "hours":
        return <HoursSection b={b} patch={patch} hours={hours} updateDay={updateDay} />;

      case "receptionist":
        return <ReceptionistSection b={b} patch={patch} setError={setError} />;

      case "notifications":
        return <NotificationsSection account={account} b={b} email={email} patch={patch} testing={testing} sendTestAlert={sendTestAlert} />;

      case "team":
        return <TeamSection crew={crew} onClose={onClose} />;

      case "integrations":
        return <IntegrationsSection account={account} line={line} go={go} onBusyCalendarChange={(next) => setAccount((prev) => (prev ? { ...prev, busyCalendar: next } : prev))} />;

      case "billing":
        return (
          <div className="sc-embed sc-embed--billing">
            <BillingContent />
          </div>
        );

      case "performance":
        return (
          <>
            <div className="sc-embed">
              <ProEconomicsPanel
                outcomes={ring1?.data?.outcomes}
                shopName={b.name}
                lastWeeklyProofAt={ring1?.data?.lastWeeklyProofAt}
              />
            </div>
            <div className="sc-embed" id="operating-metrics">
              <OperatingMetricsPanel />
            </div>
          </>
        );

      case "data":
        return <DataSection shopName={b.name} exporting={exporting} exportShopData={exportShopData} />;

      case "internal":
        return <InternalSection account={account} certChecks={certChecks} toggleCert={toggleCert} manusNext={manusNext} />;
    }
  }

  return (
    <div
      className="os-shell os-shell-pro os-shell-night sc-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="sc-dialog font-sans"
        data-pane={pane}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-title"
        tabIndex={-1}
      >
        <aside className="sc-nav" aria-label="Settings sections">
          <div className="sc-nav-brand">
            <OrviusLogo size="sm" />
            <button type="button" className="sc-icon-btn sc-mobile-only" aria-label="Close settings" onClick={onClose}>
              <SettingsIcon name="close" />
            </button>
          </div>
          <div className="sc-search">
            <SettingsIcon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  go(results[0].section);
                  setQuery("");
                }
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search settings"
              aria-label="Search settings"
            />
          </div>
          {query.trim() ? (
            <nav className="sc-nav-list" aria-label="Search results">
              {results.length ? (
                results.map((item) => (
                  <button
                    key={`${item.section}-${item.label}`}
                    type="button"
                    className="sc-nav-item sc-search-hit"
                    onClick={() => {
                      go(item.section);
                      setQuery("");
                    }}
                  >
                    <SettingsIcon name={item.section} />
                    <span className="sc-search-text">
                      <span>{item.label}</span>
                      <span className="sc-search-where">
                        {SETTINGS_SECTIONS.find((s) => s.id === item.section)?.label}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="sc-search-empty">No setting matches “{query.trim()}”.</p>
              )}
            </nav>
          ) : (
          <nav className="sc-nav-list">
            {sections.map((item, index) => {
              const heading = GROUP_LABELS[item.group];
              const first = index === 0 || sections[index - 1].group !== item.group;
              return (
                <div key={item.id} className="sc-nav-item-wrap">
                  {first && heading ? <p className="sc-nav-heading">{heading}</p> : null}
                  <button
                    type="button"
                    className={`sc-nav-item${item.id === section ? " is-active" : ""}`}
                    aria-current={item.id === section ? "page" : undefined}
                    onClick={() => go(item.id)}
                  >
                    <SettingsIcon name={item.id} />
                    <span>{item.label}</span>
                    {item.id === "account" && checklist.next ? (
                      <span className="sc-nav-badge">
                        {checklist.doneCount}/{checklist.totalCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </nav>
          )}
          <a className="sc-nav-item sc-nav-help" href="/help" target="_blank" rel="noreferrer">
            <SettingsIcon name="help" />
            <span>Get help</span>
            <SettingsIcon name="external" />
          </a>
        </aside>

        <section className="sc-main">
          <header className="sc-head">
            <button type="button" className="sc-icon-btn sc-mobile-only" aria-label="All settings" onClick={() => setPane("nav")}>
              <SettingsIcon name="back" />
            </button>
            <h2 id="sc-title" className="sc-title">
              {current.label}
            </h2>
            <span className="sc-save" aria-live="polite">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
            </span>
            <button type="button" className="sc-icon-btn" aria-label="Close settings" onClick={onClose}>
              <SettingsIcon name="close" />
            </button>
          </header>
          <div className="sc-body">
            {error ? (
              <p className="sc-banner sc-banner--error" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? <p className="sc-banner">{notice}</p> : null}
            {loadError ? (
              <div className="sc-banner sc-banner--error">
                {loadError}{" "}
                <button type="button" className="sc-link" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            ) : !account ? (
              <div className="sc-skeleton" aria-busy="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ) : !b ? (
              <p className="sc-muted">
                No shop linked yet. <Link href="/dashboard/onboarding">Finish setup</Link> to connect your line.
              </p>
            ) : (
              renderSection()
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
