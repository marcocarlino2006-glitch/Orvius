"use client";

import { ShellBadge } from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type HealthData = {
  configured: boolean;
  twilioPhone: string | null;
  ownerSmsEnabled: boolean;
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
            {health.configured ? "System ready" : "Setup needed"}
          </ShellBadge>
          {health.twilioPhone ? (
            <p className="font-sans text-sm text-void">
              Live line{" "}
              <a
                href={`tel:${health.twilioPhone}`}
                className="font-semibold tabular-nums text-flare-dim hover:text-flare"
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

      {!health.configured || !health.ownerSmsEnabled ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-fog/60 px-4 py-3">
          <p className="font-sans text-sm text-ash">
            {!health.configured
              ? "Add Twilio + Vapi credentials to go live."
              : "Enable ENABLE_OWNER_SMS and set owner phone in admin for SMS alerts."}
          </p>
          <Link href="/admin" className="btn btn-secondary text-sm">
            Open setup
          </Link>
        </div>
      ) : null}
    </section>
  );
}
