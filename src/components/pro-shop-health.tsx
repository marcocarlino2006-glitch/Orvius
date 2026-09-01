"use client";

import Link from "next/link";
import type { ShopHealth, ShopHealthStatus } from "@/lib/shop-health";

const STATUS_LABEL: Record<ShopHealthStatus, string> = {
  healthy: "All systems go",
  attention: "Needs attention",
  critical: "Action required",
};

type ProShopHealthProps = {
  health?: ShopHealth | null;
  compact?: boolean;
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ProShopHealth({ health, compact = false }: ProShopHealthProps) {
  if (!health) return null;

  const failedChecks = health.checks.filter((check) => !check.ok);

  if (compact && health.status === "healthy" && health.failedAlerts24h === 0) {
    return null;
  }

  return (
    <div
      className={`pro-shop-health pro-shop-health-${health.status} ${compact ? "pro-shop-health-compact" : ""}`}
      role="status"
    >
      <div className="pro-shop-health-head">
        <p className="pro-shop-health-kicker font-sans">Shop health</p>
        <p className="pro-shop-health-title font-sans">{STATUS_LABEL[health.status]}</p>
        {!compact && health.line && !health.lineVerified ? (
          <p className="pro-shop-health-detail font-sans">
            Place a completed test call to confirm callers reach your inbox.
          </p>
        ) : null}
      </div>

      {!compact ? (
        <dl className="pro-shop-health-meta font-sans">
          <div>
            <dt>Last call</dt>
            <dd>{formatWhen(health.lastCallAt)}</dd>
          </div>
          <div>
            <dt>Last lead</dt>
            <dd>{formatWhen(health.lastLeadAt)}</dd>
          </div>
          <div>
            <dt>Last alert</dt>
            <dd>{formatWhen(health.lastAlertAt)}</dd>
          </div>
          <div>
            <dt>Alert speed</dt>
            <dd>
              {health.alertLatencyP95Sec != null
                ? `P95 ${health.alertLatencyP95Sec}s`
                : "—"}
            </dd>
          </div>
        </dl>
      ) : null}

      {failedChecks.length > 0 ? (
        <ul className="pro-shop-health-checks font-sans">
          {failedChecks.map((check) => (
            <li key={check.id} className="pro-shop-health-check">
              <span className="pro-shop-health-check-label">{check.label}</span>
              <span className="pro-shop-health-check-detail">{check.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && health.status !== "healthy" ? (
        <Link href="/dashboard/settings" className="pro-shop-health-cta font-sans">
          Fix in settings →
        </Link>
      ) : null}
    </div>
  );
}
