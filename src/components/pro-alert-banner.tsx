"use client";

import Link from "next/link";
import type { ShopHealth } from "@/lib/shop-health";

type ProAlertBannerProps = {
  health?: Pick<ShopHealth, "failedAlerts24h" | "recentFailures"> | null;
};

export function ProAlertBanner({ health }: ProAlertBannerProps) {
  if (!health || health.failedAlerts24h <= 0) return null;

  const latest = health.recentFailures[0];
  const detail = latest
    ? `${latest.channel.toUpperCase()} alert failed${latest.error ? `: ${latest.error}` : ""}`
    : "Owner alerts failed to deliver in the last 24 hours.";

  return (
    <div className="pro-alert-banner" role="alert">
      <div className="pro-alert-banner-copy font-sans">
        <p className="pro-alert-banner-title">
          {health.failedAlerts24h} alert
          {health.failedAlerts24h === 1 ? "" : "s"} failed to send
        </p>
        <p className="pro-alert-banner-detail">{detail}</p>
      </div>
      <Link href="/dashboard/settings" className="btn btn-secondary text-sm pro-alert-banner-cta">
        Check settings
      </Link>
    </div>
  );
}
