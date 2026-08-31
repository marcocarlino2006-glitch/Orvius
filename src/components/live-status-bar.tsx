"use client";

import { ShellBadge } from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type HealthData = {
  configured: boolean;
  twilioPhone: string | null;
  ownerSmsEnabled: boolean;
  ownerPhoneIsTwilioLine?: boolean;
  ownerSmsReachable?: boolean;
  webhookUrl: string;
  stats: { businessCount: number; leadCount: number; callCount: number };
};

type DashboardPulse = {
  newLeadCount: number;
  lastCallAt: string | null;
};

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function LiveStatusBar() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pulse, setPulse] = useState<DashboardPulse | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => null);

    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) =>
        setPulse({
          newLeadCount: data.newLeadCount ?? 0,
          lastCallAt: data.lastCallAt ?? null,
        }),
      )
      .catch(() => null);
  }, []);

  if (!health) return null;

  return (
    <section className="live-status-bar live-status-bar-pro">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ShellBadge tone={health.configured ? "live" : "flare"}>
            {health.configured ? "Live" : "Setup needed"}
          </ShellBadge>
          {health.twilioPhone ? (
            <p className="font-sans text-sm text-void">
              Line{" "}
              <a
                href={`tel:${health.twilioPhone}`}
                className="font-semibold tabular-nums text-void hover:text-ash"
              >
                {health.twilioPhone}
              </a>
            </p>
          ) : null}
          {pulse?.lastCallAt ? (
            <p className="font-sans text-xs text-ash">
              Last call {formatRelativeTime(pulse.lastCallAt)}
            </p>
          ) : (
            <p className="font-sans text-xs text-ash">No calls yet</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 font-sans text-xs text-ash">
          {pulse && pulse.newLeadCount > 0 ? (
            <Link href="/dashboard/inbox" className="font-semibold text-flare-dim hover:text-flare">
              {pulse.newLeadCount} new lead{pulse.newLeadCount === 1 ? "" : "s"}
            </Link>
          ) : null}
          <span>{health.stats.callCount} calls</span>
          <span>{health.stats.leadCount} leads</span>
          <span>{health.stats.businessCount} shops</span>
        </div>
      </div>

      {!health.configured ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-fog/60 px-4 py-3">
          <p className="font-sans text-sm text-ash">
            Add Twilio + Vapi credentials to go live.
          </p>
          <Link href="/admin" className="btn btn-secondary text-sm">
            Open setup
          </Link>
        </div>
      ) : health.ownerPhoneIsTwilioLine ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-flare/25 bg-flare/8 px-4 py-3">
          <p className="font-sans text-sm text-flare-dim">
            Owner phone is the Twilio line — SMS alerts won&apos;t reach your
            cell. Set your personal number in admin.
          </p>
          <Link href="/admin" className="btn btn-secondary text-sm">
            Fix owner phone
          </Link>
        </div>
      ) : !health.ownerSmsEnabled || !health.ownerSmsReachable ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-fog/60 px-4 py-3">
          <p className="font-sans text-sm text-ash">
            Enable ENABLE_OWNER_SMS and set owner phone in admin for alerts.
          </p>
          <Link href="/admin" className="btn btn-secondary text-sm">
            Open setup
          </Link>
        </div>
      ) : null}
    </section>
  );
}
