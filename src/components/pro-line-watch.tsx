"use client";

import Link from "next/link";
import { ownerSlAs } from "@/lib/institutional-standards";
import type { ShopHealth } from "@/lib/shop-health";

function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Line watch — is the shop still covered, and is the owner hearing about it.
 * Reads the same health checks the go-live screen uses, kept to the four an
 * owner can act on.
 */
export function ProLineWatch({ health }: { health: ShopHealth | null | undefined }) {
  if (!health) return null;

  const p95 = health.alertLatencyP95Sec;
  const target = ownerSlAs.alertP95TargetSec;
  const failed = health.failedAlerts24h;
  const stuck = health.stuckPendingAlerts;

  const status =
    failed > 0 || stuck > 0 || !health.lineVerified
      ? health.status === "critical"
        ? "critical"
        : "attention"
      : "healthy";

  const rows = [
    {
      label: "Shop line",
      value: health.line ?? "Not set",
      ok: Boolean(health.line),
    },
    {
      label: "Line verified",
      value: health.lineVerified ? "Tested with a real call" : "Not tested yet",
      ok: health.lineVerified,
    },
    {
      label: "Owner alerts",
      value:
        failed > 0
          ? `${failed} failed in 24h`
          : stuck > 0
            ? `${stuck} still sending`
            : "Delivering",
      ok: failed === 0 && stuck === 0,
    },
    {
      label: "Alert speed",
      value:
        p95 != null ? `${p95}s to your phone` : "No alerts measured yet",
      ok: p95 != null ? p95 <= target : false,
    },
  ];

  return (
    <section className={`pro-rail-card pro-line-watch pro-line-watch-${status}`}>
      <div className="pro-rail-card-head">
        <p className="pro-rail-card-title font-sans">Line watch</p>
        <span className={`pro-rail-status pro-rail-status-${status}`}>
          {status === "healthy" ? "Covered" : status === "attention" ? "Check" : "At risk"}
        </span>
      </div>

      <ul className="pro-rail-rows">
        {rows.map((row) => (
          <li key={row.label}>
            <span
              className={`pro-rail-pip ${row.ok ? "pro-rail-pip-ok" : "pro-rail-pip-warn"}`}
              aria-hidden
            />
            <span className="pro-rail-row-label font-sans">{row.label}</span>
            <span className="pro-rail-row-value font-sans">{row.value}</span>
          </li>
        ))}
      </ul>

      <div className="pro-rail-card-foot font-sans">
        <span>Last call {relative(health.lastCallAt)}</span>
        <Link href="/dashboard/settings" className="pro-section-link">
          Line settings →
        </Link>
      </div>
    </section>
  );
}
