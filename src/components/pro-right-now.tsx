"use client";

import Link from "next/link";
import { ownerSlAs } from "@/lib/institutional-standards";
import type { ShopHealth } from "@/lib/shop-health";

type Tone = "live" | "watch" | "flare" | "quiet";

type Tile = {
  label: string;
  value: string;
  note: string;
  tone: Tone;
  href?: string;
};

function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * The right-now strip: what is waiting, what is unassigned, whether the line is
 * still catching calls, and how fast the owner is hearing about it. Every number
 * comes from shop records — nothing modeled.
 */
export function ProRightNow({
  waiting,
  unassigned,
  health,
  loading,
}: {
  waiting: number;
  unassigned: number;
  health: ShopHealth | null | undefined;
  loading?: boolean;
}) {
  if (loading && !health) return null;

  const lastCall = sinceLabel(health?.lastCallAt);
  const p95 = health?.alertLatencyP95Sec ?? null;
  const target = ownerSlAs.alertP95TargetSec;
  const failed = health?.failedAlerts24h ?? 0;

  const tiles: Tile[] = [
    {
      label: "New leads",
      value: String(waiting),
      note: waiting > 0 ? "Not worked yet" : "Every lead is worked",
      tone: waiting > 0 ? "flare" : "live",
      href: "/dashboard/inbox",
    },
    {
      label: "Jobs without a tech",
      value: String(unassigned),
      note: unassigned > 0 ? "Assign before the window" : "Every job has a name",
      tone: unassigned > 0 ? "watch" : "live",
      href: "/dashboard/dispatch",
    },
    {
      label: "Last call caught",
      value: lastCall ?? "—",
      note: health?.lineVerified
        ? "Line answering and verified"
        : "Line not verified yet",
      tone: health?.lineVerified ? "live" : "watch",
      href: "/dashboard/calls",
    },
    {
      label: "Alert speed",
      value: p95 != null ? `${p95}s` : "—",
      note:
        failed > 0
          ? `${failed} alert${failed === 1 ? "" : "s"} failed in 24h`
          : p95 != null
            ? `Target under ${target}s to your phone`
            : "No alerts measured yet",
      tone: failed > 0 ? "flare" : p95 != null && p95 <= target ? "live" : "watch",
      href: "/dashboard/settings",
    },
  ];

  return (
    <section className="pro-right-now" aria-label="Right now">
      <p className="pro-right-now-kicker type-eyebrow font-sans">Right now</p>
      <div className="pro-right-now-grid">
        {tiles.map((tile) => {
          const body = (
            <>
              <p className="pro-right-now-label font-sans">{tile.label}</p>
              <p className="pro-right-now-value font-sans">
                <span className={`pro-right-now-pip pro-right-now-pip-${tile.tone}`} aria-hidden />
                {tile.value}
              </p>
              <p className="pro-right-now-note font-sans">{tile.note}</p>
            </>
          );

          return tile.href ? (
            <Link className="pro-right-now-tile" href={tile.href} key={tile.label}>
              {body}
            </Link>
          ) : (
            <div className="pro-right-now-tile" key={tile.label}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
