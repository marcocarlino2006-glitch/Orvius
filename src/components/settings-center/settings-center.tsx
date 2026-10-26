"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BillingContent } from "@/components/billing-content";
import { ConnectNumber } from "@/components/connect-number";
import { OperatingMetricsPanel } from "@/components/operating-metrics-panel";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { NumbersGroup } from "./sections/numbers-group";
import { fetchAccount, invalidateAccount } from "@/lib/account-client";
import type { ReceptionistApply } from "@/lib/assistant-apply";
import { isUncertain, sendWrite, serialQueue, UNREADABLE_REPLY, WriteError } from "@/lib/client-write";
import { checkRecord, COULD_NOT_CONFIRM, CHECKING } from "@/lib/checked-write";
import { formatWhen } from "@/lib/when";
import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import { displayPhone } from "@/lib/customer";
import type { ManusPostStep } from "@/lib/manus-post";
import { useOptionalRing1 } from "@/lib/ring1-context";
import { SETTINGS_PLACES, SETTINGS_SECTIONS, placeFor, searchSettings, settingsNavLabel, type SettingsSectionId } from "@/lib/settings-center";
import type { ShopSetupStepId } from "@/lib/shop-setup-checklist";
import {
  parseHoursForm,
  serializeHoursForm,
  WEEKDAYS,
  type HoursForm,
} from "@/lib/shop-hours-form";
import { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import { supportMailto } from "@/lib/support";
import { TRADES, type Trade } from "@/lib/trades";
import { SettingsGeneral } from "./settings-general";
import { SettingsIcon } from "./settings-icons";
import { ScGroup, ScRow } from "./settings-primitives";
import { FOUNDER_CERT, applyFromReply, isSaveReply, mergeSaved, parseCert, planLabel, recordHolds, type Account, type Patch, type SaveReply, type Technician } from "./settings-model";
import { AccountSection } from "./sections/account-section";
import { BusinessSection } from "./sections/business-section";
import { ActivitySection } from "./sections/activity-section";
import { DataSection } from "./sections/data-section";
import { HoursSection } from "./sections/hours-section";
import { IntegrationsSection } from "./sections/integrations-section";
import { InternalSection } from "./sections/internal-section";
import { NotificationsSection } from "./sections/notifications-section";
import { ReceptionistSection } from "./sections/receptionist-section";
import { TeamSection } from "./sections/team-section";

/*
  One queue for every account save in this tab, kept outside the dialog, so
  closing and reopening Settings mid-save still waits for the earlier save.
*/
const accountSaves = serialQueue();
const savesInLine = new Map<string, number>();

const NEXT_SECTION: Record<ShopSetupStepId, SettingsSectionId> = {
  identity: "business",
  trade: "hours",
  service_area: "hours",
  hours: "hours",
  line: "phone",
  calendar: "team",
  owner_alerts: "notifications",
  verify: "phone",
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "checking" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apply, setApply] = useState<ReceptionistApply | null>(null);
  const [applying, setApplying] = useState(false);
  const [crew, setCrew] = useState<Technician[] | null>(null);
  const [hours, setHours] = useState<HoursForm>(() => parseHoursForm(null));
  const [certChecks, setCertChecks] = useState<boolean[]>(() => FOUNDER_CERT.map(() => false));
  const [manusNext, setManusNext] = useState<ManusPostStep | null>(null);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pane, setPane] = useState<"nav" | "pane">("pane");
  const [navQuery, setNavQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetchAccount();
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Account;
      setAccount(data);
      setApply(data.receptionistApply ?? null);
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

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /* Open once: remember the trigger, keep Tab inside the dialog, and hand focus back on close. */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [section]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  /* Saves go one at a time; each reply's saved values replace what was typed, except fields a newer save will change. */
  const enqueue = accountSaves;
  const patch = useCallback(
    (fields: Patch): Promise<boolean> => {
      const keys = Object.keys(fields);
      for (const k of keys) savesInLine.set(k, (savesInLine.get(k) ?? 0) + 1);
      return enqueue(async () => {
        setSaveState("saving");
        setError(null);
        try {
          invalidateAccount();
          const data = await sendWrite<SaveReply>("/api/account", "PATCH", fields);
          invalidateAccount();
          if (!isSaveReply(data)) throw new WriteError(UNREADABLE_REPLY, true, 200);
          const later = new Set([...savesInLine].filter(([k, n]) => n > (keys.includes(k) ? 1 : 0)).map(([k]) => k));
          setAccount((prev) => (prev && prev.business ? { ...prev, business: mergeSaved(prev.business, fields, data, later) } : prev));
          setApply((prev) => applyFromReply(data, prev));
          setSaveState("saved");
          return true;
        } catch (err) {
          if (!isUncertain(err)) {
            setError(err instanceof Error ? err.message : "That wasn't saved.");
            setSaveState("idle");
            return false;
          }
          /* No readable answer: the saved record decides, and the screen takes its values. */
          setSaveState("checking");
          const result = await checkRecord<Account>(async () => {
            invalidateAccount();
            const res = await fetch("/api/account", { cache: "no-store" });
            if (!res.ok) return null;
            const record = (await res.json().catch(() => null)) as Account | null;
            return record?.business ? record : null;
          });
          if (result.kind !== "confirmed") {
            setError(COULD_NOT_CONFIRM);
            setSaveState("idle");
            return false;
          }
          const record = result.value;
          const later = new Set([...savesInLine].filter(([k, n]) => n > (keys.includes(k) ? 1 : 0)).map(([k]) => k));
          setAccount((prev) =>
            prev && prev.business && record.business ? { ...prev, business: mergeSaved(prev.business, {}, { business: record.business }, later) } : prev,
          );
          setApply(record.receptionistApply ?? null);
          const held = record.business ? recordHolds(record.business, fields) : "unknown";
          if (held === "holds") {
            setSaveState("saved");
            return true;
          }
          setError(
            held === "differs"
              ? "Orvius checked: this change isn't in your saved settings. Settings now show what's saved."
              : "Orvius didn't get an answer and can't see this setting from here. Reopen settings to check it before changing it again.",
          );
          setSaveState("idle");
          return false;
        } finally {
          for (const k of keys) savesInLine.set(k, Math.max(0, (savesInLine.get(k) ?? 1) - 1));
        }
      });
    },
    [enqueue],
  );

  const applyNow = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const data = await enqueue(() => sendWrite<{ receptionistApply?: ReceptionistApply }>("/api/account/sync-assistant", "POST"));
      invalidateAccount();
      if (data.receptionistApply) setApply(data.receptionistApply);
    } catch (err) {
      setError(isUncertain(err) ? "Orvius didn't hear back from the receptionist check. Reopen settings to see where it stands." : err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setApplying(false);
    }
  }, [enqueue]);

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
              business: {
                ...prev.business,
                overflowForwardConfirmedAt: stamp,
                ...(next ? {} : { overflowProvedAt: null }),
              },
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
      const data = (await res.json()) as { error?: string; ok?: boolean; partial?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Nothing went out. Check your mobile number.");
      if (data.partial) setError(data.message ?? "Only part of the test alert went out.");
      else setNotice(data.message ?? "Test alert sent.");
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
      let next: string | null = "/api/account/export";
      let parts = 0;
      while (next && parts < 50) {
        const res: Response = await fetch(next);
        if (!res.ok) throw new Error(parts ? `Export stopped after part ${parts}` : "Export failed");
        const text = await res.text();
        const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = match?.[1] ?? `orvius-export-part${parts + 1}.json`;
        a.click();
        URL.revokeObjectURL(url);
        parts += 1;
        next = (JSON.parse(text) as { nextPage?: string | null }).nextPage ?? null;
      }
      if (next) throw new Error(`Downloaded ${parts} parts; the rest is at ${next}`);
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

  const query = navQuery.trim().toLowerCase();
  const matched = new Set(searchSettings(query).map((hit) => hit.section));
  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== "internal" || account?.founder).filter(
    (s) =>
      !query ||
      matched.has(s.id) ||
      `${s.label} ${settingsNavLabel(s)}`.toLowerCase().includes(query),
  );
  const current = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  const here = placeFor(section);
  const places = SETTINGS_PLACES.filter((place) => place.id !== "internal" || account?.founder);
  const more = here && section === here.sections[0].id ? here.sections.slice(1) : [];
  const name = account?.user?.name ?? b?.name ?? "Owner";
  const email = account?.user?.email ?? b?.ownerEmail ?? "";

  function go(next: SettingsSectionId) {
    onSection(next);
    setPane("pane");
  }

  const placeRows = more.length ? (
    <div className="sc-place-more">
      {more.map((item) => {
        const meta = SETTINGS_SECTIONS.find((s) => s.id === item.id);
        return (
          <button key={item.id} type="button" className="sc-place-row" onClick={() => go(item.id)}>
            <span className="sc-row-copy">
              <span className="sc-row-label">{meta ? settingsNavLabel(meta) : item.id}</span>
              <span className="sc-row-hint">{item.detail}</span>
            </span>
            <SettingsIcon name="back" />
          </button>
        );
      })}
    </div>
  ) : null;

  function renderSection() {
    if (section === "general") {
      return (
        <SettingsGeneral
          smsOn={Boolean(account?.alerts.smsEnabled)}
          emailOn={Boolean(account?.alerts.emailConfigured)}
          smsOptedOut={Boolean(account?.alerts.ownerSmsOptedOut)}
        />
      );
    }
    if (!account || !b) return null;
    switch (section) {
      case "account":
        return <AccountSection account={account} b={b} name={name} email={email} checklist={checklist} go={go} />;

      case "business":
        return <BusinessSection b={b} patch={patch} />;

      case "phone":
        return (
          <div id="overflow-forward">
            <ConnectNumber onConfirmManually={(next) => saveOverflow(next)} />
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
            <NumbersGroup b={b} patch={patch} setError={setError} />
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

      case "activity":
        return <ActivitySection role={account.role ?? null} />;

      case "data":
        return (
          <DataSection
            shopName={b.name}
            planRenews={
              Boolean(account.billing?.hasSubscription) &&
              !account.billing?.planEndsAt &&
              ["active", "past_due"].includes((account.billing?.status ?? b.billingStatus ?? "").toLowerCase())
            }
            exporting={exporting}
            exportShopData={exportShopData}
            go={go}
          />
        );

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
          <div className="sc-nav-user">
            <button type="button" className="sc-nav-user-btn" onClick={() => go("account")}>
              <span className="mn-avatar" aria-hidden>
                {(name || "O").slice(0, 1).toUpperCase()}
              </span>
              <span className="sc-nav-user-copy">
                <span className="sc-nav-user-name">{name}</span>
                <span className="sc-nav-user-sub">{b?.name ?? "Your shop"}</span>
                {account ? <span className="sc-nav-user-plan">{planLabel(account)}</span> : null}
              </span>
            </button>
            <button type="button" className="sc-icon-btn sc-mobile-only" aria-label="Close settings" onClick={onClose}>
              <SettingsIcon name="close" />
            </button>
          </div>
          <label className="sc-nav-search">
            <SettingsIcon name="search" />
            <input
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search settings"
            />
          </label>
          {crew !== null && checklist.next && !query ? (
            <button type="button" className="sc-next" onClick={() => go(NEXT_SECTION[checklist.next!.id])}>
              <span className="sc-next-kicker">Next</span>
              <span className="sc-next-label">{checklist.next.detail}</span>
            </button>
          ) : null}
          <nav className="sc-nav-list">
            {query
              ? sections.map((item) => (
                  <div key={item.id} className="sc-nav-item-wrap">
                    <button
                      type="button"
                      className={`sc-nav-item${item.id === section ? " is-active" : ""}`}
                      aria-current={item.id === section ? "page" : undefined}
                      onClick={() => go(item.id)}
                    >
                      <SettingsIcon name={item.id} />
                      <span className="sc-nav-item-label">{settingsNavLabel(item)}</span>
                    </button>
                  </div>
                ))
              : places.map((place) => (
                  <div key={place.id} className="sc-nav-item-wrap">
                    <button
                      type="button"
                      className={`sc-nav-item${here?.id === place.id ? " is-active" : ""}`}
                      aria-current={here?.id === place.id ? "page" : undefined}
                      onClick={() => go(place.sections[0].id)}
                    >
                      <SettingsIcon name={place.icon} />
                      <span className="sc-nav-item-label">{place.label}</span>
                    </button>
                  </div>
                ))}
            {query && !sections.length ? <p className="sc-nav-empty">No settings match “{navQuery.trim()}”.</p> : null}
          </nav>
        </aside>

        <section className="sc-main">
          <header className="sc-head">
            <button
              type="button"
              className="sc-icon-btn sc-mobile-only"
              aria-label="All settings"
              onClick={() => (here && section !== here.sections[0].id ? go(here.sections[0].id) : setPane("nav"))}
            >
              <SettingsIcon name="back" />
            </button>
            <div className="sc-head-copy">
              {here && section !== here.sections[0].id ? (
                <button type="button" className="sc-crumb" onClick={() => go(here.sections[0].id)}>
                  <SettingsIcon name="back" />
                  {here.label}
                </button>
              ) : null}
              <h2 id="sc-title" className="sc-title">
                {current.label}
              </h2>
            </div>
            <span className="sc-save" aria-live="polite">
              {saveState === "saving" ? "Saving…" : saveState === "checking" ? CHECKING : saveState === "saved" ? "Saved" : ""}
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
            {apply ? <ReceptionistApplyBanner apply={apply} section={section} applying={applying} timezone={account?.business?.timezone} onApply={() => void applyNow()} /> : null}
            {loadError ? (
              <div className="sc-banner sc-banner--error">
                {loadError}{" "}
                <button type="button" className="sc-link" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            ) : !account ? (
              <>
                {placeRows}
                <div className="sc-skeleton" aria-busy="true">
                  <span className="skeleton" />
                  <span className="skeleton" />
                  <span className="skeleton" />
                </div>
              </>
            ) : !b && section !== "general" ? (
              <>
                {placeRows}
                <p className="sc-muted">
                  No shop linked yet. <Link href="/dashboard/onboarding">Finish setup</Link> to connect your line.
                </p>
              </>
            ) : (
              <>
                {account.role === "dispatcher" && section !== "team" && section !== "account" ? (
                  <p className="sc-banner" role="status">
                    You&apos;re a Dispatcher here, so settings are view-only. The shop owner or a manager can change them.
                  </p>
                ) : null}
                {placeRows}
                {renderSection()}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Saved and applied are different facts. Anything short of the provider
 * confirming this exact version stays visible, with the one step that helps;
 * a confirmation is shown as when it happened, not as the line being healthy.
 */
function ReceptionistApplyBanner({ apply, section, applying, timezone, onApply }: { apply: ReceptionistApply; section: SettingsSectionId; applying: boolean; timezone?: string | null; onApply: () => void }) {
  const aboutTheLine = section === "business" || section === "hours" || section === "receptionist";
  if (!aboutTheLine) return null;
  const receptionistPane = section === "receptionist" || section === "hours";
  if (apply.state === "applied") {
    return receptionistPane && apply.appliedAt ? (
      <p className="sc-banner" role="status">
        Saved and applied: the receptionist confirmed these settings {formatWhen(apply.appliedAt, new Date(), timezone)}. That was the last confirmation, not a live check of your line.
      </p>
    ) : null;
  }
  if (apply.state === "not_applicable") {
    return receptionistPane ? (
      <p className="sc-banner" role="status">
        Saved. {apply.next}
      </p>
    ) : null;
  }
  return (
    <div className={`sc-banner${apply.state === "failed" ? " sc-banner--error" : ""}`} role="status">
      <strong>{apply.state === "failed" ? "Saved, but the receptionist didn't take it." : "Saved, not confirmed on the receptionist."}</strong>{" "}
      {apply.error ? `${apply.error} ` : ""}
      {apply.next}{" "}
      {apply.canApply ? (
        <button type="button" className="sc-link" disabled={applying} onClick={onApply}>
          {applying ? "Applying…" : "Apply to receptionist"}
        </button>
      ) : null}
    </div>
  );
}
