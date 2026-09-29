"use client";

import { useState } from "react";
import { displayPhone } from "@/lib/customer";
import type { SettingsSectionId } from "@/lib/settings-center";
import { BusyCalendarGroup } from "../busy-calendar-group";
import { CopyLinkButton } from "../settings-controls";
import type { Account, BusyCalendar } from "../settings-model";
import { ScGroup, ScStatus } from "../settings-primitives";

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
    mark: string;
    offLabel?: string;
    action?: { label: string; to: SettingsSectionId };
    copy?: string;
    reset?: boolean;
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
      detail: feedNote
        ? feedNote
        : feedUrl
          ? "See your jobs in Google, Apple, or Outlook Calendar. Updates about every 15 minutes. Anyone with the link can see them."
          : "Calendar feed switches on from our side",
      on: Boolean(feedUrl),
      mark: "CAL",
      copy: feedUrl ?? undefined,
      reset: Boolean(feedUrl),
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
            ) : null}
            {row.reset ? (
              <button type="button" className="sc-btn" disabled={feedBusy} onClick={() => void resetFeed()}>
                {feedBusy ? "Resetting…" : "Reset link"}
              </button>
            ) : null}
            {row.copy ? null : row.action ? (
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
