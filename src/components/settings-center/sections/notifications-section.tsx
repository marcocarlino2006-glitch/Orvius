"use client";

import { ownerSlAs } from "@/lib/institutional-standards";
import { PushAlertsRows } from "../push-alerts-rows";
import type { Account, Business, PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow, ScStatus } from "../settings-primitives";

export function NotificationsSection({
  account,
  b,
  email,
  patch,
  testing,
  sendTestAlert,
}: {
  account: Account;
  b: Business;
  email: string;
  patch: PatchFn;
  testing: boolean;
  sendTestAlert: () => Promise<void>;
}) {
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
}
