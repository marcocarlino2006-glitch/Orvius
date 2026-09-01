"use client";

import Link from "next/link";
import type { ShopHealth } from "@/lib/shop-health";

type ProAlertBannerProps = {
  health?: Pick<
    ShopHealth,
    "failedAlerts24h" | "recentFailures" | "lastAlertAt"
  > | null;
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ProAlertBanner({ health }: ProAlertBannerProps) {
  if (!health || health.failedAlerts24h <= 0) return null;

  const latest = health.recentFailures[0];
  const detail = latest
    ? `${latest.channel.toUpperCase()} failed${latest.error ? `: ${latest.error}` : ""}`
    : "Owner alerts failed to deliver in the last 24 hours.";

  return (
    <div className="pro-alert-banner" role="alert">
      <div className="pro-alert-banner-copy font-sans">
        <p className="pro-alert-banner-title">
          {health.failedAlerts24h} owner alert
          {health.failedAlerts24h === 1 ? "" : "s"} failed
        </p>
        <p className="pro-alert-banner-detail">{detail}</p>
        {health.lastAlertAt ? (
          <p className="pro-alert-banner-meta">
            Last successful alert {formatWhen(health.lastAlertAt)}
          </p>
        ) : (
          <p className="pro-alert-banner-meta">No successful alerts recorded yet</p>
        )}
      </div>
      <div className="pro-alert-banner-actions">
        <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
          Fix in settings
        </Link>
      </div>
    </div>
  );
}
