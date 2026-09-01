"use client";

import Link from "next/link";
import { telHref } from "@/lib/demo-line";
import { useBusiness } from "@/lib/use-business";

type ProSignalBarProps = {
  showInboxLink?: boolean;
  compact?: boolean;
};

export function ProSignalBar({
  showInboxLink = true,
  compact = false,
}: ProSignalBarProps) {
  const { business } = useBusiness();
  const line = business?.line;
  const newLeads = business?.metrics.newLeads ?? 0;
  const ownerPhone = business?.ownerPhone;

  return (
    <div className={`pro-signal-bar ${compact ? "pro-signal-bar-compact" : ""}`}>
      <div className="pro-signal-bar-main">
        <p className="pro-signal-bar-kicker font-sans">
          {line ? (
            <>
              <span className="pro-live-dot" aria-hidden />
              Your shop line
            </>
          ) : (
            "Line not configured"
          )}
        </p>
        {line ? (
          <a href={telHref(line)} className="pro-signal-bar-line font-sans">
            {line}
          </a>
        ) : (
          <Link href="/dashboard/settings" className="pro-signal-bar-setup font-sans">
            Open settings to connect your number
          </Link>
        )}
        {!compact ? (
          <p className="pro-signal-bar-meta font-sans">
            {ownerPhone
              ? `Owner alerts → ${ownerPhone}`
              : "Add your mobile in settings for SMS alerts"}
          </p>
        ) : null}
      </div>

      <div className="pro-signal-bar-actions font-sans">
        {newLeads > 0 && showInboxLink ? (
          <Link href="/dashboard/inbox" className="pro-signal-bar-alert">
            {newLeads} need follow-up
          </Link>
        ) : null}
        {line ? (
          <a href={telHref(line)} className="btn btn-void text-sm">
            Test call
          </a>
        ) : (
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Settings
          </Link>
        )}
      </div>
    </div>
  );
}
