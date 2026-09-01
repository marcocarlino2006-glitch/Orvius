"use client";

import type { ShopHealth } from "@/lib/shop-health";

type ProAlertSpeedBadgeProps = {
  health?: Pick<
    ShopHealth,
    "alertLatencyP95Sec" | "alertSpeedOk" | "stuckPendingAlerts" | "pendingAlerts"
  > | null;
};

function speedTone(health: NonNullable<ProAlertSpeedBadgeProps["health"]>) {
  if (health.stuckPendingAlerts > 0) return "critical";
  if (health.alertLatencyP95Sec == null) return "unknown";
  if (health.alertLatencyP95Sec <= 60) return "good";
  if (health.alertLatencyP95Sec <= 120) return "warn";
  return "critical";
}

const TONE_LABEL = {
  good: "Alerts fast",
  warn: "Alerts slow",
  critical: "Alerts stuck",
  unknown: "Measuring alerts",
} as const;

export function ProAlertSpeedBadge({ health }: ProAlertSpeedBadgeProps) {
  if (!health) return null;

  const tone = speedTone(health);
  const detail =
    health.stuckPendingAlerts > 0
      ? `${health.stuckPendingAlerts} stuck in queue`
      : health.alertLatencyP95Sec != null
        ? `P95 ${health.alertLatencyP95Sec}s to your phone`
        : health.pendingAlerts > 0
          ? `${health.pendingAlerts} sending now`
          : "Place a lead to measure speed";

  return (
    <div className={`pro-alert-speed pro-alert-speed-${tone}`} role="status">
      <span className="pro-alert-speed-dot" aria-hidden />
      <div className="pro-alert-speed-copy font-sans">
        <p className="pro-alert-speed-label">{TONE_LABEL[tone]}</p>
        <p className="pro-alert-speed-detail">{detail}</p>
      </div>
    </div>
  );
}
