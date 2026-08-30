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

export function LiveStatusBar() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => null);
  }, []);

  if (!health) return null;

  return (
    <section className="live-status-bar">
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
        </div>
        <div className="flex flex-wrap items-center gap-4 font-sans text-xs text-ash">
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
