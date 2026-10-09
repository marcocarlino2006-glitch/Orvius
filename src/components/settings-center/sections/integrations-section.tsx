"use client";

import { useEffect, useState } from "react";
import { displayPhone } from "@/lib/customer";
import type { SettingsSectionId } from "@/lib/settings-center";
import { BusyCalendarGroup } from "../busy-calendar-group";
import { CopyLinkButton } from "../settings-controls";
import type { Account, BusyCalendar, JobberLink, QuickBooksLink } from "../settings-model";
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
    disconnect?: "jobber" | "quickbooks";
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
      detail: account.billing?.fullyReady ? "Card payments and payouts" : "Set up payouts to take deposits",
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
    jobberRow(jobber, jobberNote),
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
            {row.copy || row.href || row.disconnect ? null : row.action ? (
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
      onChange={onBusyCalendarChange}
    />
    </>
  );
}

function jobberRow(jobber: JobberLink, note: string | null) {
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
      detail: note ?? `New calls land in ${jobber.accountName ?? "Jobber"} as requests. ${sent} sent in 30 days.${attention}`,
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
