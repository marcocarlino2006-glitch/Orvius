"use client";

import Link from "next/link";
import { telHref } from "@/lib/demo-line";
import { useBusiness } from "@/lib/use-business";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProTodayPulseProps = {
  health?: ShopHealth | null;
  newLeads: number;
};

function healthTone(health: ShopHealth | null | undefined): "good" | "warn" | "critical" | "unknown" {
  if (!health) return "unknown";
  if (health.status === "critical") return "critical";
  if (health.status === "attention") return "warn";
  return "good";
}

function alertSpeedLabel(health: ShopHealth | null | undefined): string {
  if (!health) return "Measuring";
  if (health.stuckPendingAlerts > 0) return "Stuck";
  if (health.alertLatencyP95Sec != null) {
    return health.alertLatencyP95Sec <= 60 ? "Fast" : "Slow";
  }
  return "Measuring";
}

const HEALTH_LABEL = {
  good: "All systems go",
  warn: "Needs attention",
  critical: "Action required",
  unknown: "Loading",
} as const;

export function ProTodayPulse({ health, newLeads }: ProTodayPulseProps) {
  const { business } = useBusiness();
  const line = business?.line;
  const ownerPhone = business?.ownerPhone;
  const tone = healthTone(health);

  return (
    <div className="pro-today-pulse" role="region" aria-label="Shop status">
      <div className="pro-today-pulse-glow" aria-hidden />
      <div className="pro-today-pulse-inner">
        <div className="pro-today-pulse-main">
          <p className="pro-today-pulse-kicker font-sans">
            <span className="pro-live-dot" aria-hidden />
            {line ? "Your shop line" : "Setup required"}
          </p>
          {line ? (
            <a href={telHref(line)} className="pro-today-pulse-line font-sans">
              {line}
            </a>
          ) : (
            <Link href="/dashboard/settings" className="pro-today-pulse-setup font-sans">
              Connect your number in Settings
            </Link>
          )}
          {ownerPhone ? (
            <p className="pro-today-pulse-meta font-sans">Alerts → {ownerPhone}</p>
          ) : (
            <p className="pro-today-pulse-meta font-sans">
              Add your mobile in Settings for SMS alerts
            </p>
          )}
        </div>

        <div className="pro-today-pulse-metrics font-sans">
          <div className={`pro-today-metric pro-today-metric-${tone}`}>
            <span className="pro-today-metric-label">Health</span>
            <span className="pro-today-metric-value">{HEALTH_LABEL[tone]}</span>
          </div>
          <div className="pro-today-metric">
            <span className="pro-today-metric-label">Alert speed</span>
            <span className="pro-today-metric-value">{alertSpeedLabel(health)}</span>
          </div>
          <div className={`pro-today-metric ${newLeads > 0 ? "pro-today-metric-active" : ""}`}>
            <span className="pro-today-metric-label">Follow-up</span>
            <span className="pro-today-metric-value">{newLeads}</span>
          </div>
        </div>

        <div className="pro-today-pulse-actions font-sans">
          {newLeads > 0 ? (
            <Link href="/dashboard/inbox" className="pro-today-pulse-alert">
              {newLeads} lead{newLeads === 1 ? "" : "s"} waiting
            </Link>
          ) : null}
          {line ? (
            <a href={telHref(line)} className="btn btn-void text-sm">
              Test call
            </a>
          ) : (
            <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
              Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

type ProTodayAlertsProps = {
  health?: ShopHealth | null;
  wedge?: WedgeReadiness | null;
  newLeads: number;
  economicsReady?: boolean;
  proofStale?: boolean;
  certIncomplete?: boolean;
  pilotDaysLeft?: number | null;
  checkoutReady?: boolean;
};

export function ProTodayAlerts({
  health,
  wedge,
  newLeads,
  economicsReady = true,
  proofStale = false,
  certIncomplete = false,
  pilotDaysLeft = null,
  checkoutReady = true,
}: ProTodayAlertsProps) {
  const hasFailures = (health?.failedAlerts24h ?? 0) > 0;
  const hasStuck = (health?.stuckPendingAlerts ?? 0) > 0;
  const wedgeIncomplete = wedge && !wedge.ready;
  const showLeads = newLeads > 0;
  const pilotUrgent = pilotDaysLeft != null && pilotDaysLeft <= 7;

  if (
    !showLeads &&
    !hasFailures &&
    !hasStuck &&
    !wedgeIncomplete &&
    economicsReady &&
    !proofStale &&
    !certIncomplete &&
    !pilotUrgent &&
    checkoutReady
  ) {
    return null;
  }

  return (
    <div className="pro-today-alerts" role="region" aria-label="Action items">
      {certIncomplete ? (
        <div className="pro-today-alert pro-today-alert-critical">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">Phone certification incomplete</p>
            <p className="pro-today-alert-detail">
              Multi-b rule: finish 5 real-cell scenarios before high-volume outreach.
            </p>
          </div>
          <Link href="/dashboard/settings#founder-cert" className="btn btn-void text-sm">
            Certify now
          </Link>
        </div>
      ) : null}

      {pilotUrgent || !checkoutReady ? (
        <div className="pro-today-alert pro-today-alert-critical">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">
              {!checkoutReady
                ? "Stripe not live — cannot collect money"
                : pilotDaysLeft != null && pilotDaysLeft <= 0
                  ? "Pilot ended — subscribe to keep the line"
                  : `Pilot ends in ${pilotDaysLeft} day${pilotDaysLeft === 1 ? "" : "s"}`}
            </p>
            <p className="pro-today-alert-detail">
              Category leaders collect cash. Open billing and close the founder unblock.
            </p>
          </div>
          <Link href="/dashboard/billing" className="btn btn-void text-sm">
            Open billing
          </Link>
        </div>
      ) : null}

      {!economicsReady ? (
        <div className="pro-today-alert pro-today-alert-priority">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">Baseline economics missing</p>
            <p className="pro-today-alert-detail">
              Set avg ticket + before-Orvius baselines to measure recovered jobs.
            </p>
          </div>
          <Link
            href="/dashboard/settings#economics-baseline"
            className="btn btn-secondary text-sm"
          >
            Set baseline
          </Link>
        </div>
      ) : null}

      {proofStale ? (
        <div className="pro-today-alert pro-today-alert-priority">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">Weekly proof due</p>
            <p className="pro-today-alert-detail">
              Copy this week&apos;s proof artifact — measured money, not homepage claims.
            </p>
          </div>
          <Link href="/dashboard" className="btn btn-secondary text-sm">
            Scroll to economics
          </Link>
        </div>
      ) : null}

      {showLeads ? (
        <div className="pro-today-alert pro-today-alert-priority">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">
              {newLeads} new lead{newLeads === 1 ? "" : "s"} waiting
            </p>
            <p className="pro-today-alert-detail">
              Qualified leads need callback or booking.
            </p>
          </div>
          <Link href="/dashboard/inbox" className="btn btn-void text-sm">
            Open inbox
          </Link>
        </div>
      ) : null}

      {hasFailures || hasStuck ? (
        <div className="pro-today-alert pro-today-alert-critical">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">
              {hasStuck
                ? "Alerts stuck — check now"
                : `${health!.failedAlerts24h} alert${health!.failedAlerts24h === 1 ? "" : "s"} failed`}
            </p>
            <p className="pro-today-alert-detail">
              {hasStuck
                ? `${health!.stuckPendingAlerts} alert(s) stuck over 5 minutes.`
                : "Owner may not have been notified."}
            </p>
          </div>
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Fix in settings
          </Link>
        </div>
      ) : null}

      {wedgeIncomplete ? (
        <div className="pro-today-alert pro-today-alert-setup">
          <div className="pro-today-alert-copy font-sans">
            <p className="pro-today-alert-title">
              {wedge.total - wedge.score} step{wedge.total - wedge.score === 1 ? "" : "s"} before go-live
            </p>
            <ul className="pro-today-wedge-list">
              {wedge.items
                .filter((item) => !item.ok)
                .slice(0, 3)
                .map((item) => (
                  <li key={item.id}>
                    {item.actionHref ? (
                      <Link href={item.actionHref} className="pro-today-wedge-link">
                        {item.label} →
                      </Link>
                    ) : (
                      item.label
                    )}
                  </li>
                ))}
            </ul>
          </div>
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Go-live checklist
          </Link>
        </div>
      ) : null}
    </div>
  );
}
