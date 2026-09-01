"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

export function ProShopHealth({ health: initial, compact = false }: ProShopHealthProps) {
  const [health, setHealth] = useState<ShopHealth | null>(initial ?? null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shop/health");
      if (!res.ok) return;
      setHealth(await res.json());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    if (initial) return;
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [initial, load]);

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
            Place a test call to confirm callers reach your inbox.
          </p>
        ) : null}
      </div>

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
