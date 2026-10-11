"use client";

import { useEffect, useState } from "react";
import { displayPhone } from "@/lib/customer";
import type { SettingsSectionId } from "@/lib/settings-center";
import { BusyCalendarGroup } from "../busy-calendar-group";
import { CopyLinkButton } from "../settings-controls";
import type { Account, BusyCalendar, HousecallLink, JobberLink, QuickBooksLink, ServiceTitanLink } from "../settings-model";
import { ScGroup, ScStatus } from "../settings-primitives";
import { SettingsIcon, type SettingsIconName } from "../settings-icons";

export function IntegrationsSection({
  account,
  line,
  go,
  onBusyCalendarChange,
}: {
  account: Account;
  line: string | null;
  go: (next: SettingsSectionId) => void;
  onBusyCalendarChange: (next: BusyCalendar) => void;
}) {
  const [feedUrl, setFeedUrl] = useState(account.calendarFeedUrl ?? null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedNote, setFeedNote] = useState<string | null>(null);

  const [jobber, setJobber] = useState<JobberLink>(account.jobber ?? null);
  const [jobberBusy, setJobberBusy] = useState(false);
  const [jobberNote, setJobberNote] = useState<string | null>(null);

  const [housecall, setHousecall] = useState<HousecallLink>(account.housecall ?? null);
  const [hcpOpen, setHcpOpen] = useState(false);
  const [hcpKey, setHcpKey] = useState("");
  const [hcpBusy, setHcpBusy] = useState(false);
  const [hcpNote, setHcpNote] = useState<string | null>(null);
  const [hcpError, setHcpError] = useState<string | null>(null);

  const [servicetitan, setServicetitan] = useState<ServiceTitanLink>(account.servicetitan ?? null);
  const [stOpen, setStOpen] = useState(false);
  const [stFields, setStFields] = useState({ tenantId: "", clientId: "", clientSecret: "" });
  const [stBusy, setStBusy] = useState(false);
  const [stNote, setStNote] = useState<string | null>(null);
  const [stError, setStError] = useState<string | null>(null);

  const [quickbooks, setQuickbooks] = useState<QuickBooksLink>(account.quickbooks ?? null);
  const [qbBusy, setQbBusy] = useState(false);
  const [qbNote, setQbNote] = useState<string | null>(null);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("quickbooks");
    const notes: Record<string, string> = {
      connected: "QuickBooks connected. Payments you collect from now on go there as sales receipts.",
      cancelled: "QuickBooks was not connected.",
      expired: "That QuickBooks link expired. Connect again.",
      failed: "QuickBooks did not finish connecting. Try again.",
      unavailable: "QuickBooks is not live yet.",
    };
    if (outcome && notes[outcome]) setQbNote(notes[outcome]);
  }, []);

  async function disconnectQuickBooks() {
    if (!window.confirm("Disconnect QuickBooks? New payments stop going to QuickBooks. Receipts already there stay.")) return;
    setQbBusy(true);
    setQbNote(null);
    try {
      const res = await fetch("/api/integrations/quickbooks/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Could not disconnect. Try again.");
      setQuickbooks((prev) => (prev ? { ...prev, status: "disconnected", companyName: null } : prev));
      setQbNote("QuickBooks disconnected.");
    } catch (error) {
      setQbNote(error instanceof Error ? error.message : "Could not disconnect. Try again.");
    } finally {
      setQbBusy(false);
    }
  }

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("jobber");
    const notes: Record<string, string> = {
      connected: "Jobber connected. New calls land there as requests.",
      cancelled: "Jobber was not connected.",
      expired: "That Jobber link expired. Connect again.",
      failed: "Jobber did not finish connecting. Try again.",
      unavailable: "Jobber is not live yet.",
    };
    if (outcome && notes[outcome]) setJobberNote(notes[outcome]);
  }, []);

  async function disconnectJobber() {
    if (!window.confirm("Disconnect Jobber? New calls stop going to Jobber. Requests already there stay.")) return;
    setJobberBusy(true);
    setJobberNote(null);
    try {
      const res = await fetch("/api/integrations/jobber/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Could not disconnect. Try again.");
      setJobber((prev) => (prev ? { ...prev, status: "disconnected", accountName: null } : prev));
      setJobberNote("Jobber disconnected.");
    } catch (error) {
      setJobberNote(error instanceof Error ? error.message : "Could not disconnect. Try again.");
    } finally {
      setJobberBusy(false);
    }
  }

  async function connectHousecall() {
    setHcpBusy(true);
    setHcpError(null);
    try {
      const res = await fetch("/api/integrations/housecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: hcpKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.housecall) throw new Error(data.error ?? "Could not connect. Try again.");
      setHousecall(data.housecall);
      setHcpKey("");
      setHcpOpen(false);
      setHcpNote(null);
    } catch (error) {
      setHcpError(error instanceof Error ? error.message : "Could not connect. Try again.");
    } finally {
      setHcpBusy(false);
    }
  }

  async function disconnectHousecall() {
    if (!window.confirm("Disconnect Housecall Pro? New calls stop going to Housecall Pro. Leads already there stay.")) return;
    setHcpBusy(true);
    setHcpNote(null);
    try {
      const res = await fetch("/api/integrations/housecall", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect. Try again.");
      setHousecall((prev) => (prev ? { ...prev, status: "disconnected", companyName: null } : prev));
      setHcpNote("Housecall Pro disconnected.");
    } catch (error) {
      setHcpNote(error instanceof Error ? error.message : "Could not disconnect. Try again.");
    } finally {
      setHcpBusy(false);
    }
  }

  async function connectServiceTitan() {
    setStBusy(true);
    setStError(null);
    try {
      const res = await fetch("/api/integrations/servicetitan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stFields),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.servicetitan) throw new Error(data.error ?? "Could not connect. Try again.");
      setServicetitan(data.servicetitan);
      setStFields({ tenantId: "", clientId: "", clientSecret: "" });
      setStOpen(false);
      setStNote(null);
    } catch (error) {
      setStError(error instanceof Error ? error.message : "Could not connect. Try again.");
    } finally {
      setStBusy(false);
    }
  }

  async function disconnectServiceTitan() {
    if (!window.confirm("Disconnect ServiceTitan? New calls stop going to its booking queue. Bookings already there stay.")) return;
    setStBusy(true);
    setStNote(null);
    try {
      const res = await fetch("/api/integrations/servicetitan", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect. Try again.");
      setServicetitan((prev) => (prev ? { ...prev, status: "disconnected", providerName: null } : prev));
      setStNote("ServiceTitan disconnected.");
    } catch (error) {
      setStNote(error instanceof Error ? error.message : "Could not disconnect. Try again.");
    } finally {
      setStBusy(false);
    }
  }

  async function resetFeed() {
    if (!window.confirm("Reset the calendar link? Calendars subscribed to the old link stop updating until you add the new one.")) return;
    setFeedBusy(true);
    setFeedNote(null);
    try {
      const res = await fetch("/api/account/calendar-feed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.calendarFeedUrl) throw new Error(data.error ?? "Could not reset the link. Try again.");
      setFeedUrl(data.calendarFeedUrl);
      setFeedNote("New link ready. The old one no longer works.");
    } catch (error) {
      setFeedNote(error instanceof Error ? error.message : "Could not reset the link. Try again.");
    } finally {
      setFeedBusy(false);
    }
  }

  const schedule = account.fsmSchedule ?? null;
  const readingSchedule = Boolean(schedule?.syncedAt && !schedule.error);
  const blindTo =
    account.business?.bookingMode === "alert" || account.busyCalendar || readingSchedule
      ? null
      : (
          [
            [jobber?.status === "active", "Jobber"],
            [housecall?.status === "active", "Housecall Pro"],
            [servicetitan?.status === "active", "ServiceTitan"],
          ] as const
        ).find(([on]) => on)?.[1] ?? null;

  const rows: Array<{
    name: string;
    detail: string;
    on: boolean;
    mark: SettingsIconName;
    offLabel?: string;
    hidden?: boolean;
    action?: { label: string; to: SettingsSectionId };
    copy?: string;
    reset?: boolean;
    href?: { label: string; url: string };
    disconnect?: "jobber" | "quickbooks" | "housecall" | "servicetitan";
    keyEntry?: { label: string; form: "housecall" | "servicetitan" };
  }> = [
    {
      name: "Phone line",
      detail: line ? `Answering ${displayPhone(line)}` : "Not connected",
      on: Boolean(line),
      mark: "phone",
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
      mark: "sms",
      action: { label: "Configure", to: "notifications" },
    },
    {
      name: "Email",
      detail: "Backup alerts",
      on: account.alerts.emailConfigured,
      mark: "mail",
      hidden: !account.alerts.emailConfigured,
    },
    {
      name: "Stripe",
      detail: account.billing?.fullyReady ? "Card payments and payouts" : "Set up payments to take deposits and bills by card",
      on: Boolean(account.billing?.fullyReady),
      mark: "billing",
      action: { label: account.billing?.fullyReady ? "Manage" : "Connect", to: "billing" },
    },
    {
      name: "Jobs calendar feed",
      detail: feedNote
        ? feedNote
        : feedUrl
          ? "See your jobs in Google, Apple, or Outlook Calendar. Updates about every 15 minutes. Anyone with the link can see them."
          : "",
      on: Boolean(feedUrl),
      hidden: !feedUrl && !feedNote,
      mark: "calendar",
      copy: feedUrl ?? undefined,
      reset: Boolean(feedUrl),
    },
    jobberRow(jobber, jobberNote, scheduleLine(schedule, "jobber")),
    housecallRow(housecall, hcpNote, scheduleLine(schedule, "housecall")),
    serviceTitanRow(servicetitan, stNote, scheduleLine(schedule, "servicetitan")),
    quickbooksRow(quickbooks, qbNote),
  ];
  return (
    <>
    <ScGroup>
      {rows.filter((row) => !row.hidden).map((row) => (
        <div key={row.name} className="sc-row sc-connector">
          <span className="sc-connector-mark" aria-hidden>
            <SettingsIcon name={row.mark} />
          </span>
          <div className="sc-row-copy">
            <p className="sc-row-label">{row.name}</p>
            <p className="sc-row-hint">{row.detail}</p>
          </div>
          <div className="sc-row-control">
            {row.on ? <ScStatus on>Connected</ScStatus> : null}
            {row.copy ? (
              <CopyLinkButton value={row.copy} />
            ) : null}
            {row.reset ? (
              <button type="button" className="sc-btn" disabled={feedBusy} onClick={() => void resetFeed()}>
                {feedBusy ? "Resetting…" : "Reset link"}
              </button>
            ) : null}
            {row.disconnect === "jobber" ? (
              <button type="button" className="sc-btn" disabled={jobberBusy} onClick={() => void disconnectJobber()}>
                {jobberBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : null}
            {row.disconnect === "housecall" ? (
              <button type="button" className="sc-btn" disabled={hcpBusy} onClick={() => void disconnectHousecall()}>
                {hcpBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : null}
            {row.disconnect === "servicetitan" ? (
              <button type="button" className="sc-btn" disabled={stBusy} onClick={() => void disconnectServiceTitan()}>
                {stBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : null}
            {row.keyEntry && !(row.keyEntry.form === "housecall" ? hcpOpen : stOpen) ? (
              <button
                type="button"
                className="sc-btn"
                onClick={() => (row.keyEntry!.form === "housecall" ? setHcpOpen(true) : setStOpen(true))}
              >
                {row.keyEntry.label}
              </button>
            ) : null}
            {row.disconnect === "quickbooks" ? (
              <button type="button" className="sc-btn" disabled={qbBusy} onClick={() => void disconnectQuickBooks()}>
                {qbBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : null}
            {row.href ? (
              <a className="sc-btn" href={row.href.url}>
                {row.href.label}
              </a>
            ) : null}
            {row.copy || row.href || row.disconnect || row.keyEntry ? null : row.action ? (
              <button type="button" className="sc-btn" onClick={() => go(row.action!.to)}>
                {row.action.label}
              </button>
            ) : row.on ? null : (
              <ScStatus on={false}>{row.offLabel ?? "Off"}</ScStatus>
            )}
          </div>
        </div>
      ))}
      {hcpOpen ? (
        <form
          className="sc-row sc-key-entry"
          onSubmit={(event) => {
            event.preventDefault();
            void connectHousecall();
          }}
        >
          <div className="sc-row-copy">
            <label className="sc-row-label" htmlFor="hcp-api-key">
              Housecall Pro API key
            </label>
            <p className="sc-row-hint">
              In Housecall Pro, open My Apps → API Key Management, generate a Full access key, and paste it here. Needs the Housecall Pro MAX plan. Orvius
              stores it encrypted and only uses it to add leads and customers.
            </p>
            <input
              id="hcp-api-key"
              className="sc-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={hcpKey}
              onChange={(event) => setHcpKey(event.target.value)}
              aria-invalid={hcpError ? true : undefined}
              aria-describedby={hcpError ? "hcp-api-key-error" : undefined}
            />
            {hcpError ? (
              <p id="hcp-api-key-error" className="sc-field-error" role="alert">
                {hcpError}
              </p>
            ) : null}
          </div>
          <div className="sc-row-control">
            <button type="button" className="sc-btn" disabled={hcpBusy} onClick={() => { setHcpOpen(false); setHcpError(null); }}>
              Cancel
            </button>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={hcpBusy || !hcpKey.trim()}>
              {hcpBusy ? "Checking…" : "Connect"}
            </button>
          </div>
        </form>
      ) : null}
      {stOpen ? (
        <form
          className="sc-row sc-key-entry"
          onSubmit={(event) => {
            event.preventDefault();
            void connectServiceTitan();
          }}
        >
          <div className="sc-row-copy">
            <p className="sc-row-label">Connect ServiceTitan</p>
            <p className="sc-row-hint">
              In ServiceTitan, open Settings → Integrations → API Application Access, connect Orvius, and copy the three values it shows. Add a booking
              provider tag named Orvius so calls land under it. Orvius stores the secret encrypted and only uses it to add bookings.
            </p>
            {(
              [
                ["tenantId", "Tenant ID", "text"],
                ["clientId", "Client ID", "text"],
                ["clientSecret", "Client secret", "password"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="sc-key-field">
                <span>{label}</span>
                <input
                  className="sc-input"
                  type={type}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={key === "tenantId" ? "numeric" : undefined}
                  value={stFields[key]}
                  onChange={(event) => setStFields((prev) => ({ ...prev, [key]: event.target.value }))}
                  aria-invalid={stError ? true : undefined}
                  aria-describedby={stError ? "st-error" : undefined}
                />
              </label>
            ))}
            {stError ? (
              <p id="st-error" className="sc-field-error" role="alert">
                {stError}
              </p>
            ) : null}
          </div>
          <div className="sc-row-control">
            <button type="button" className="sc-btn" disabled={stBusy} onClick={() => { setStOpen(false); setStError(null); }}>
              Cancel
            </button>
            <button
              type="submit"
              className="sc-btn sc-btn--primary"
              disabled={stBusy || !stFields.tenantId.trim() || !stFields.clientId.trim() || !stFields.clientSecret.trim()}
            >
              {stBusy ? "Checking…" : "Connect"}
            </button>
          </div>
        </form>
      ) : null}
      {blindTo ? (
        <div className="sc-row sc-schedule-warning" role="note">
          <div className="sc-row-copy">
            <p className="sc-row-label">Orvius can&apos;t read your {blindTo} schedule yet</p>
            <p className="sc-row-hint">
              {schedule?.error
                ? `The last try failed: ${schedule.error}. `
                : `Orvius checks it every 30 minutes and hasn't read it yet. `}
              Until it does, a caller could be offered a time that is already taken in {blindTo}. Add a Google, iCloud or Outlook calendar
              under Busy times below, or set booking to &ldquo;Alert me first&rdquo; so you pick every time.
            </p>
          </div>
          <div className="sc-row-control">
            <button type="button" className="sc-btn" onClick={() => go("receptionist")}>
              Booking settings
            </button>
          </div>
        </div>
      ) : null}
    </ScGroup>
    <BusyCalendarGroup
      value={account.busyCalendar ?? null}
      onChange={onBusyCalendarChange}
    />
    </>
  );
}

function scheduleLine(schedule: Account["fsmSchedule"], source: string) {
  if (schedule?.source !== source) return "";
  if (schedule.error) return ` Can't read its schedule: ${schedule.error}.`;
  if (!schedule.syncedAt) return " Reading its schedule soon.";
  return " Orvius reads its schedule and won't offer a time already booked there.";
}

function jobberRow(jobber: JobberLink, note: string | null, schedule: string) {
  const base = { name: "Jobber", mark: "jobs" as const };
  const connect = { label: "Connect", url: "/api/integrations/jobber/connect" };
  if (jobber?.status === "active") {
    const sent = jobber.sentLast30Days === 1 ? "1 call" : `${jobber.sentLast30Days} calls`;
    const attention = jobber.needsAttention
      ? ` ${jobber.needsAttention} did not go through. Your alert texts still have them.`
      : "";
    return {
      ...base,
      on: true,
      detail: note ?? `New calls land in ${jobber.accountName ?? "Jobber"} as requests. ${sent} sent in 30 days.${attention}${schedule}`,
      disconnect: "jobber" as const,
    };
  }
  if (jobber?.status === "reconnect") {
    return { ...base, on: false, detail: note ?? "Jobber stopped accepting Orvius. Reconnect to keep calls flowing there.", href: { ...connect, label: "Reconnect" } };
  }
  if (!jobber?.available) {
    return { ...base, on: false, detail: note ?? "", hidden: !note };
  }
  return { ...base, on: false, detail: note ?? "Send every call to Jobber as a request, matched to the client by phone.", href: connect };
}

function housecallRow(hcp: HousecallLink, note: string | null, schedule: string) {
  const base = { name: "Housecall Pro", mark: "jobs" as const };
  if (hcp?.status === "active") {
    const sent = hcp.sentLast30Days === 1 ? "1 call" : `${hcp.sentLast30Days} calls`;
    const attention = hcp.needsAttention ? ` ${hcp.needsAttention} did not go through. Your alert texts still have them.` : "";
    return {
      ...base,
      on: true,
      detail: note ?? `New calls land in ${hcp.companyName ?? "Housecall Pro"} as leads. ${sent} sent in 30 days.${attention}${schedule}`,
      disconnect: "housecall" as const,
    };
  }
  if (hcp?.status === "reconnect") {
    return { ...base, on: false, detail: note ?? "Housecall Pro stopped accepting the key. Paste a new one to keep calls flowing there.", keyEntry: { label: "Reconnect", form: "housecall" as const } };
  }
  if (!hcp?.available) {
    return { ...base, on: false, detail: note ?? "", hidden: !note };
  }
  return { ...base, on: false, detail: note ?? "Send every call to Housecall Pro as a lead, matched to the customer by phone.", keyEntry: { label: "Connect", form: "housecall" as const } };
}

function serviceTitanRow(st: ServiceTitanLink, note: string | null, schedule: string) {
  const base = { name: "ServiceTitan", mark: "jobs" as const };
  if (st?.status === "active") {
    const sent = st.sentLast30Days === 1 ? "1 call" : `${st.sentLast30Days} calls`;
    const attention = st.needsAttention ? ` ${st.needsAttention} did not go through. Your alert texts still have them.` : "";
    return {
      ...base,
      on: true,
      detail: note ?? `New calls land in your ServiceTitan booking queue${st.providerName ? ` as ${st.providerName}` : ""}. ${sent} sent in 30 days.${attention}${schedule}`,
      disconnect: "servicetitan" as const,
    };
  }
  if (st?.status === "reconnect") {
    return { ...base, on: false, detail: note ?? "ServiceTitan stopped accepting Orvius. Connect again to keep calls flowing there.", keyEntry: { label: "Reconnect", form: "servicetitan" as const } };
  }
  if (!st?.available) {
    return { ...base, on: false, detail: note ?? "", hidden: !note };
  }
  return { ...base, on: false, detail: note ?? "Send every call to your ServiceTitan booking queue, ready for your CSRs to book.", keyEntry: { label: "Connect", form: "servicetitan" as const } };
}

function quickbooksRow(qb: QuickBooksLink, note: string | null) {
  const base = { name: "QuickBooks", mark: "billing" as const };
  const connect = { label: "Connect", url: "/api/integrations/quickbooks/connect" };
  if (qb?.status === "active") {
    const sent = qb.sentLast30Days === 1 ? "1 payment" : `${qb.sentLast30Days} payments`;
    const attention = qb.needsAttention
      ? ` ${qb.needsAttention} did not go through; enter ${qb.needsAttention === 1 ? "it" : "them"} by hand.`
      : "";
    return {
      ...base,
      on: true,
      detail:
        note ??
        `Paid invoices and deposits land in ${qb.companyName ?? "QuickBooks"} as sales receipts, usually within 30 minutes. Refunds aren't sent. ${sent} sent in 30 days.${attention}`,
      disconnect: "quickbooks" as const,
    };
  }
  if (qb?.status === "reconnect") {
    return { ...base, on: false, detail: note ?? "QuickBooks stopped accepting Orvius. Reconnect to keep payments flowing there.", href: { ...connect, label: "Reconnect" } };
  }
  if (!qb?.available) {
    return { ...base, on: false, detail: note ?? "", hidden: !note };
  }
  return {
    ...base,
    on: false,
    detail: note ?? "Send every payment you collect to QuickBooks Online as a sales receipt, matched to the customer. Only payments from after you connect.",
    href: connect,
  };
}
