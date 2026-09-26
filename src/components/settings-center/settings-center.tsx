"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BillingContent } from "@/components/billing-content";
import { CaptureSetupPanel } from "@/components/capture-setup-panel";
import { DeleteWorkspace } from "@/components/delete-workspace";
import { FounderManusNext } from "@/components/founder-manus-next";
import { OperatingMetricsPanel } from "@/components/operating-metrics-panel";
import { OrviusLogo } from "@/components/orvius-logo";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { RecordAvatar } from "@/components/record-avatar";
import { fetchAccount, invalidateAccount } from "@/lib/account-client";
import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import { pricing } from "@/lib/company";
import { ownerSlAs } from "@/lib/institutional-standards";
import { displayPhone } from "@/lib/customer";
import type { ManusPostStep } from "@/lib/manus-post";
import { useOptionalRing1 } from "@/lib/ring1-context";
import { SETTINGS_SECTIONS, searchSettings, type SettingsSectionId } from "@/lib/settings-center";
import { PushAlertsRows } from "@/components/settings-center/push-alerts-rows";
import { DEFAULT_VOICE_ID, RECEPTIONIST_VOICES } from "@/lib/voices";
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
import { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import { TRADES, type Trade } from "@/lib/trades";
import { SettingsIcon } from "./settings-icons";
import { ScField, ScGroup, ScRow, ScStatus, ScSwitch } from "./settings-primitives";

function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this calendar link", value);
    }
  }
  return (
    <button type="button" className="sc-btn" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

type BusyCalendar = { source: string | null; syncedAt: string | null; error: string | null } | null;

function BusyCalendarGroup({ value, onChange }: { value: BusyCalendar; onChange: (next: BusyCalendar) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/busy-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ error: true, text: data.error ?? "Could not read that calendar." });
        return;
      }
      setUrl("");
      onChange({ source: data.source, syncedAt: data.syncedAt, error: null });
      setMessage({
        error: false,
        text:
          data.busyBlocks > 0
            ? `Found ${data.busyBlocks === 1 ? "1 busy time" : `${data.busyBlocks} busy times`} in the next two weeks. Callers won't be offered ${data.busyBlocks === 1 ? "it" : "those"}.`
            : "Nothing busy in the next two weeks. Anything you add there blocks booking within 10 minutes.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/busy-calendar", { method: "DELETE" });
      if (res.ok) {
        onChange(null);
        setMessage(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScGroup title="Busy times">
      {value ? (
        <ScRow
          label={`${value.source ?? "Calendar"} connected`}
          hint={
            value.error
              ? `Last check failed: ${value.error} Callers are offered times from the last good copy.`
              : "Times you're busy there are never offered to callers. Checked every 10 minutes while calls come in."
          }
        >
          <button type="button" className="sc-btn" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        </ScRow>
      ) : (
        <ScRow
          stack
          label="Block times you're busy"
          hint="Paste your calendar's secret iCal address. Google: Settings → your calendar → Integrate calendar → Secret address in iCal format. Apple and Outlook share links work too."
        >
          <div className="sc-inline-field">
            <input
              className="sc-input"
              aria-label="Calendar iCal address"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={url}
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="sc-btn sc-btn--primary"
              disabled={busy || url.trim().length < 8}
              onClick={() => void connect()}
            >
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </ScRow>
      )}
      {message ? (
        <p className={message.error ? "sc-banner sc-banner--error" : "sc-banner"} role="status">
          {message.text}
        </p>
      ) : null}
    </ScGroup>
  );
}

type Account = {
  founder?: boolean;
  calendarFeedUrl?: string | null;
  busyCalendar?: BusyCalendar;
  user?: { name: string | null; email: string | null; image?: string | null };
  business: {
    name: string;
    trade?: string | null;
    address?: string | null;
    ownerPhone: string | null;
    ownerEmail: string | null;
    greeting: string | null;
    transferPhone?: string | null;
    voiceId?: string | null;
    avgTicketCents: number | null;
    baselineMissedCallsPerWeek: number | null;
    baselineJobsPerWeek: number | null;
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
    autopilot?: boolean;
    createdAt?: string;
    vapiPhoneNumber?: string | null;
    twilioPhone?: string | null;
  } | null;
  line?: string | null;
  billing?: {
    configured?: boolean;
    fullyReady?: boolean;
    entitled?: boolean;
    status?: string;
    plan?: { name: string; price: number; period?: string };
    pilotEndsAt?: string | null;
  };
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
    ownerSmsOptedOut?: boolean;
  };
};

type Technician = { id: string; name: string; phone?: string | null };

type Patch = Record<string, unknown>;

const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

const GROUP_LABELS: Record<string, string | null> = {
  you: null,
  shop: "Shop",
  workspace: "Workspace",
  founder: "Founder",
};

function parseCert(raw: string | null | undefined): boolean[] {
  const empty = FOUNDER_CERT.map(() => false);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as boolean[];
    return Array.isArray(parsed) && parsed.length === FOUNDER_CERT.length ? parsed.map(Boolean) : empty;
  } catch {
    return empty;
  }
}

function planLabel(account: Account): string {
  const status = account.billing?.status ?? account.business?.billingStatus ?? "none";
  if (account.billing?.entitled === false && (status === "pilot" || status === "none")) return "Access ended";
  if (status === "pilot") return pricing.pilot.name;
  if (status === "active" || status === "past_due") return account.billing?.plan?.name ?? "Active plan";
  if (status === "canceled") return "Canceled";
  return "No plan";
}

function planDetail(account: Account): string {
  const status = account.billing?.status ?? "none";
  if (status === "active") return "Your subscription is active.";
  if (status === "past_due") return "Payment failed — update your card to keep the line live.";
  if (status === "pilot") {
    const ends = account.billing?.pilotEndsAt ? new Date(account.billing.pilotEndsAt) : null;
    return ends && !Number.isNaN(ends.getTime())
      ? `Access through ${ends.toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`
      : "Your shop access is active.";
  }
  return "No active subscription yet.";
}

function dollars(value: string): number | null {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return value.trim() && Number.isFinite(n) ? n : null;
}

function VoiceSampleButton({ voiceId }: { voiceId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [voiceId]);

  useEffect(() => () => audioRef.current?.pause(), []);

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(`/voices/${voiceId}.mp3`);
    audioRef.current?.pause();
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  }

  return (
    <button type="button" className="sc-btn sc-voice-play" onClick={toggle} aria-pressed={playing}>
      {playing ? "Stop" : "Play"}
    </button>
  );
}

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
        return (
          <>
            <div className="sc-profile">
              {account.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sc-profile-avatar" src={account.user.image} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="sc-profile-avatar">
                  <RecordAvatar name={name} />
                </span>
              )}
              <div className="sc-profile-copy">
                <p className="sc-profile-name">{name}</p>
                <p className="sc-profile-email">{email}</p>
              </div>
              <button type="button" className="sc-btn" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </button>
            </div>

            <div className="sc-plan">
              <div>
                <p className="sc-plan-kicker">Plan</p>
                <p className="sc-plan-name">{planLabel(account)}</p>
                <p className="sc-plan-detail">{planDetail(account)}</p>
              </div>
              <button type="button" className="sc-btn sc-btn--primary" onClick={() => go("billing")}>
                {account.billing?.status === "active" ? "Manage" : "Upgrade"}
              </button>
            </div>

            {checklist.next ? (
              <div className="sc-plan sc-plan--setup">
                <div className="sc-setup-copy">
                  <p className="sc-plan-kicker">
                    Setup · {checklist.doneCount} of {checklist.totalCount}
                  </p>
                  <p className="sc-plan-name">{checklist.next.label}</p>
                  <p className="sc-plan-detail">{checklist.next.detail}</p>
                  <div className="sc-meter" aria-hidden>
                    <span style={{ width: `${Math.round(checklist.progress * 100)}%` }} />
                  </div>
                </div>
                <Link href={checklist.next.href} className="sc-btn">
                  Continue
                </Link>
              </div>
            ) : null}

            <ScGroup title="Workspace">
              <ScRow label="Shop" hint={[b.trade, b.address].filter(Boolean).join(" · ") || undefined}>
                <span className="sc-value">{b.name}</span>
              </ScRow>
              <ScRow label="Role">
                <span className="sc-value">
                  {email && b.ownerEmail && email.toLowerCase() === b.ownerEmail.toLowerCase() ? "Owner" : "Member"}
                </span>
              </ScRow>
              {b.createdAt ? (
                <ScRow label="Member since">
                  <span className="sc-value">
                    {new Date(b.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                </ScRow>
              ) : null}
            </ScGroup>
          </>
        );

      case "business":
        return (
          <ScGroup>
            <ScRow label="Business name" hint="What callers hear when the line answers.">
              <ScField
                ariaLabel="Business name"
                value={b.name}
                onCommit={(v) => (v.trim().length >= 2 ? patch({ name: v.trim() }) : false)}
              />
            </ScRow>
            <ScRow label="Trade" hint="Sets receptionist language and emergency rules.">
              <div className="sc-segment" role="radiogroup" aria-label="Trade">
                {TRADES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={(b.trade ?? "HVAC") === item}
                    className={(b.trade ?? "HVAC") === item ? "is-active" : ""}
                    onClick={() => void patch({ trade: item })}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </ScRow>
            <ScRow label="Shop address" hint="Used for directions and travel time.">
              <ScField
                ariaLabel="Shop address"
                value={b.address ?? ""}
                placeholder="1842 Oak Street, Austin TX"
                autoComplete="street-address"
                onCommit={(v) => patch({ address: v.trim() || null })}
              />
            </ScRow>
          </ScGroup>
        );

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
        return (
          <>
            <ScGroup title="Open hours">
              {WEEKDAYS.map((day) => {
                const entry = hours[day];
                return (
                  <div key={day} className="sc-row sc-hours-row">
                    <div className="sc-row-copy">
                      <p className="sc-row-label">{weekdayLabel(day)}</p>
                    </div>
                    <div className="sc-row-control">
                      {entry.closed ? (
                        <span className="sc-muted">Closed</span>
                      ) : (
                        <span className="sc-hours-times">
                          <input
                            type="time"
                            className="sc-input sc-time"
                            value={entry.open}
                            onChange={(e) => updateDay(day, { open: e.target.value })}
                            aria-label={`${weekdayLabel(day)} open`}
                          />
                          <span className="sc-muted">to</span>
                          <input
                            type="time"
                            className="sc-input sc-time"
                            value={entry.close}
                            onChange={(e) => updateDay(day, { close: e.target.value })}
                            aria-label={`${weekdayLabel(day)} close`}
                          />
                        </span>
                      )}
                      <ScSwitch
                        label={`Open on ${weekdayLabel(day)}`}
                        checked={!entry.closed}
                        onChange={(open) => updateDay(day, { closed: !open })}
                      />
                    </div>
                  </div>
                );
              })}
            </ScGroup>
            <ScGroup title="Work you take">
              <ScRow stack label="Services" hint="One per line. Written into the receptionist's service list.">
                <ScField
                  multiline
                  rows={4}
                  ariaLabel="Services"
                  value={parseServicesForm(b.servicesJson)}
                  placeholder={"AC repair\nHeating repair\nMaintenance"}
                  onCommit={(v) => patch({ servicesJson: serializeServicesForm(v) })}
                />
              </ScRow>
              <ScRow
                stack
                label="Service ZIPs"
                hint="Comma-separated. Leads outside these stay on the board instead of booking."
              >
                <ScField
                  ariaLabel="Service ZIPs"
                  value={parseZipsForm(b.serviceZipsJson)}
                  placeholder="33101, 33109, 33139"
                  inputMode="numeric"
                  autoComplete="off"
                  onCommit={(v) => patch({ serviceZipsJson: serializeZipsForm(v) })}
                />
              </ScRow>
            </ScGroup>
          </>
        );

      case "receptionist":
        return (
          <>
            <ScGroup>
              <ScRow stack label="Opening line" hint="The first thing every caller hears.">
                <ScField
                  multiline
                  ariaLabel="Opening line"
                  value={b.greeting ?? ""}
                  placeholder={`Thank you for calling ${b.name}. How can I help you today?`}
                  onCommit={(v) => patch({ greeting: v.trim() })}
                />
              </ScRow>
              <ScRow label="Voice" hint="Callers hear this voice. Changes apply to the next call.">
                <select
                  className="sc-input"
                  aria-label="Receptionist voice"
                  value={b.voiceId ?? DEFAULT_VOICE_ID}
                  onChange={(e) => void patch({ voiceId: e.target.value })}
                >
                  {RECEPTIONIST_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label} — {voice.description}
                    </option>
                  ))}
                </select>
                <VoiceSampleButton voiceId={b.voiceId ?? DEFAULT_VOICE_ID} />
              </ScRow>
              <ScRow
                label="Connect callers who ask for a person"
                hint="The receptionist takes their name and number, then transfers the call here. Leave empty to get a callback text instead."
              >
                <ScField
                  type="tel"
                  ariaLabel="Transfer number"
                  value={b.transferPhone ?? ""}
                  placeholder="+1 555 123 4567"
                  onCommit={(v) => patch({ transferPhone: v.trim() || null })}
                />
              </ScRow>
              <ScRow
                label="Handle routine work"
                hint="Confirms upcoming appointments by text and assigns a job when one technician is clearly the right fit. Ties, emergencies, and safety calls still come to you."
              >
                <ScSwitch
                  label="Handle routine work"
                  checked={b.autopilot ?? true}
                  onChange={(next) => void patch({ autopilot: next })}
                />
              </ScRow>
            </ScGroup>
            <ScGroup title="Your numbers">
              <ScRow label="Average ticket" hint="Estimates booked value on Command. Not money collected.">
                <span className="sc-affix">
                  <span>$</span>
                  <ScField
                    narrow
                    ariaLabel="Average ticket in dollars"
                    inputMode="numeric"
                    value={b.avgTicketCents ? String(Math.round(b.avgTicketCents / 100)) : ""}
                    placeholder="285"
                    onCommit={(v) => {
                      const n = dollars(v);
                      if (n != null && (n < 50 || n > 50000)) {
                        setError("Average ticket must be between $50 and $50,000.");
                        return false;
                      }
                      return patch({ avgTicketCents: n == null ? null : Math.round(n * 100) });
                    }}
                  />
                </span>
              </ScRow>
              <ScRow label="Missed calls a week before Orvius">
                <ScField
                  narrow
                  ariaLabel="Missed calls a week before Orvius"
                  inputMode="numeric"
                  value={b.baselineMissedCallsPerWeek != null ? String(b.baselineMissedCallsPerWeek) : ""}
                  placeholder="12"
                  onCommit={(v) => {
                    const n = dollars(v);
                    return patch({ baselineMissedCallsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
                  }}
                />
              </ScRow>
              <ScRow label="Jobs booked a week before Orvius">
                <ScField
                  narrow
                  ariaLabel="Jobs booked a week before Orvius"
                  inputMode="numeric"
                  value={b.baselineJobsPerWeek != null ? String(b.baselineJobsPerWeek) : ""}
                  placeholder="8"
                  onCommit={(v) => {
                    const n = dollars(v);
                    return patch({ baselineJobsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
                  }}
                />
              </ScRow>
            </ScGroup>
          </>
        );

      case "notifications":
        return (
          <div id="owner-alerts">
            {account.alerts.ownerSmsOptedOut ? (
              <p className="sc-banner sc-banner--error">
                This number texted STOP, so new leads will not reach you. Text <strong>START</strong> to the shop alert
                number from your cell, then send a test alert.
              </p>
            ) : null}
            <ScGroup>
              <ScRow label="Your mobile" hint="Your cell, not the shop line. Every new lead is texted here.">
                <ScField
                  type="tel"
                  ariaLabel="Your mobile"
                  value={b.ownerPhone ?? ""}
                  placeholder="+1 555 123 4567"
                  onCommit={(v) => patch({ ownerPhone: v.trim() })}
                />
              </ScRow>
              <ScRow label="Email" hint="Your sign-in email. Backup alerts go here when a text can't deliver.">
                <span className="sc-value">{b.ownerEmail ?? email}</span>
              </ScRow>
            </ScGroup>
            <ScGroup title="How alerts reach you">
              <ScRow label="Text alerts" hint={`Target: on your phone within ${ownerSlAs.alertP95TargetSec} seconds of the call.`}>
                <ScStatus on={account.alerts.smsEnabled && !account.alerts.ownerSmsOptedOut}>
                  {account.alerts.ownerSmsOptedOut ? "Opted out" : account.alerts.smsEnabled ? "On" : "Off"}
                </ScStatus>
              </ScRow>
              <ScRow
                label="Email backup"
                hint={account.alerts.emailConfigured ? undefined : "Switches on from our side. Nothing to set up."}
              >
                <ScStatus on={account.alerts.emailConfigured}>{account.alerts.emailConfigured ? "On" : "Off"}</ScStatus>
              </ScRow>
              <PushAlertsRows />
              <ScRow label="Send a test alert" hint="Texts your mobile the way a real lead would.">
                <button type="button" className="sc-btn" disabled={testing} onClick={() => void sendTestAlert()}>
                  {testing ? "Sending…" : "Send test"}
                </button>
              </ScRow>
            </ScGroup>
          </div>
        );

      case "team":
        return (
          <>
            <ScGroup title={crew ? `Technicians · ${crew.length}` : "Technicians"}>
              {crew === null ? (
                <p className="sc-muted sc-pad">Loading…</p>
              ) : crew.length === 0 ? (
                <ScRow label="No technicians yet" hint="Add your crew so Orvius can assign jobs." />
              ) : (
                crew.map((tech) => (
                  <div key={tech.id} className="sc-row sc-person">
                    <RecordAvatar name={tech.name} />
                    <div className="sc-row-copy">
                      <p className="sc-row-label">{tech.name}</p>
                      <p className="sc-row-hint">{tech.phone ? displayPhone(tech.phone) : "No mobile on file"}</p>
                    </div>
                  </div>
                ))
              )}
            </ScGroup>
            <div className="sc-actions">
              <Link href="/dashboard/dispatch" className="sc-btn" onClick={onClose}>
                Manage crew and schedule
              </Link>
            </div>
          </>
        );

      case "integrations": {
        const rows: Array<{
          name: string;
          detail: string;
          on: boolean;
          mark: string;
          offLabel?: string;
          action?: { label: string; to: SettingsSectionId };
          copy?: string;
        }> = [
          {
            name: "Phone line",
            detail: line ? `Answering ${displayPhone(line)}` : "Not connected",
            on: Boolean(line),
            mark: "PH",
            action: { label: line ? "Configure" : "Connect", to: "phone" },
          },
          {
            name: "Text messages",
            detail: account.alerts.ownerSmsOptedOut
              ? "Owner number opted out"
              : account.alerts.smsEnabled
                ? "Lead alerts and customer confirmations"
                : "Not connected",
            on: account.alerts.smsEnabled && !account.alerts.ownerSmsOptedOut,
            mark: "SMS",
            action: { label: "Configure", to: "notifications" },
          },
          {
            name: "Email",
            detail: account.alerts.emailConfigured ? "Backup alerts" : "Switches on from our side",
            on: account.alerts.emailConfigured,
            mark: "@",
            offLabel: "Off",
          },
          {
            name: "Stripe",
            detail: account.billing?.fullyReady ? "Card payments and payouts" : "Set up payouts to take deposits",
            on: Boolean(account.billing?.fullyReady),
            mark: "S",
            action: { label: account.billing?.fullyReady ? "Manage" : "Connect", to: "billing" },
          },
          {
            name: "Jobs calendar feed",
            detail: account.calendarFeedUrl
              ? "See your jobs in Google, Apple, or Outlook Calendar. Updates about every 15 minutes."
              : "Calendar feed switches on from our side",
            on: Boolean(account.calendarFeedUrl),
            mark: "CAL",
            copy: account.calendarFeedUrl ?? undefined,
          },
        ];
        return (
          <>
          <ScGroup>
            {rows.map((row) => (
              <div key={row.name} className="sc-row sc-connector">
                <span className="sc-connector-mark" aria-hidden>
                  {row.mark}
                </span>
                <div className="sc-row-copy">
                  <p className="sc-row-label">{row.name}</p>
                  <p className="sc-row-hint">{row.detail}</p>
                </div>
                <div className="sc-row-control">
                  {row.on ? <ScStatus on>Connected</ScStatus> : null}
                  {row.copy ? (
                    <CopyLinkButton value={row.copy} />
                  ) : row.action ? (
                    <button type="button" className="sc-btn" onClick={() => go(row.action!.to)}>
                      {row.action.label}
                    </button>
                  ) : row.on ? null : (
                    <ScStatus on={false}>{row.offLabel ?? "Off"}</ScStatus>
                  )}
                </div>
              </div>
            ))}
          </ScGroup>
          <BusyCalendarGroup
            value={account.busyCalendar ?? null}
            onChange={(next) => setAccount((prev) => (prev ? { ...prev, busyCalendar: next } : prev))}
          />
          </>
        );
      }

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
        return (
          <>
            <ScGroup>
              <ScRow label="Export shop data" hint="Customers, leads, jobs, and money records as one JSON file.">
                <button type="button" className="sc-btn" disabled={exporting} onClick={() => void exportShopData()}>
                  {exporting ? "Preparing…" : "Export"}
                </button>
              </ScRow>
            </ScGroup>
            <ScGroup title="Danger zone">
              <div className="sc-embed sc-pad">
                <DeleteWorkspace workspaceName={b.name} />
              </div>
            </ScGroup>
          </>
        );

      case "internal": {
        const certDone = certChecks.filter(Boolean).length;
        if (!account?.founder) return null;
        return (
          <>
            <ScGroup title={`Founder phone certification · ${certDone} of ${FOUNDER_CERT.length}`}>
              {FOUNDER_CERT.map((label, index) => (
                <ScRow key={label} label={label}>
                  <ScSwitch
                    label={label}
                    checked={certChecks[index] ?? false}
                    onChange={() => void toggleCert(index)}
                  />
                </ScRow>
              ))}
            </ScGroup>
            <ScGroup title="Launch checklist · next">
              <div className="sc-embed sc-pad">
                <FounderManusNext tone="quiet" next={manusNext} />
              </div>
            </ScGroup>
            {!account.alerts.emailConfigured ? (
              <ScGroup title="Email failover">
                <ScRow
                  id="email-failover"
                  label="Resend is not configured"
                  hint="Add RESEND_API_KEY and RESEND_FROM on Vercel, redeploy, then send a test alert. Owners never see this."
                />
              </ScGroup>
            ) : null}
          </>
        );
      }
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
