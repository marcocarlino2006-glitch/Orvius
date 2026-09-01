"use client";

import Link from "next/link";
import {
  getOwnerStandardsReport,
  standardsScore,
  type OwnerStandardItem,
} from "@/lib/institutional-standards";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type ProSetupHubProps = {
  health?: ShopHealth | null;
  wedge?: WedgeReadiness | null;
};

function StandardRow({ item }: { item: OwnerStandardItem }) {
  const tone = item.ok === null ? "unknown" : item.ok ? "good" : "warn";

  return (
    <div className={`pro-setup-standard pro-setup-standard-${tone}`}>
      <span className={`pro-standards-dot pro-standards-dot-${tone}`} aria-hidden />
      <div className="pro-setup-standard-copy">
        <span className="pro-setup-standard-label">{item.label}</span>
        <span className="pro-setup-standard-value">{item.actual}</span>
      </div>
      {item.href && item.ok === false ? (
        <Link href={item.href} className="pro-setup-standard-link">
          Fix →
        </Link>
      ) : null}
    </div>
  );
}

export function ProSetupHub({ health, wedge }: ProSetupHubProps) {
  if (!health && !wedge) return null;

  const hasFailures = (health?.failedAlerts24h ?? 0) > 0;
  const hasStuck = (health?.stuckPendingAlerts ?? 0) > 0;
  const standards = getOwnerStandardsReport(health ?? null);
  const score = standardsScore(standards);
  const progress = wedge ? Math.round((wedge.score / wedge.total) * 100) : 0;

  return (
    <section className="pro-setup-hub" aria-label="Shop setup and health">
      {hasFailures || hasStuck ? (
        <div className="pro-setup-alert" role="alert">
          <p className="pro-setup-alert-title font-sans">
            {hasStuck
              ? "Alerts stuck — owner may not have been notified"
              : `${health!.failedAlerts24h} alert${health!.failedAlerts24h === 1 ? "" : "s"} failed in the last 24 hours`}
          </p>
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Review alerts
          </Link>
        </div>
      ) : null}

      <div className="pro-setup-hub-grid">
        {wedge ? (
          <div className="pro-setup-card pro-setup-checklist">
            <div className="pro-setup-card-head font-sans">
              <p className="pro-setup-kicker">Go-live checklist</p>
              <p className="pro-setup-title">
                {wedge.ready
                  ? "Production ready"
                  : `${wedge.score}/${wedge.total} complete`}
              </p>
              <div className="pro-setup-progress" aria-hidden>
                <span
                  className="pro-setup-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <ol className="pro-setup-steps font-sans">
              {wedge.items.map((item) => (
                <li
                  key={item.id}
                  className={`pro-setup-step ${item.ok ? "pro-setup-step-done" : ""}`}
                >
                  <span className="pro-setup-step-check" aria-hidden>
                    {item.ok ? "✓" : "○"}
                  </span>
                  <div className="pro-setup-step-copy">
                    <span className="pro-setup-step-label">{item.label}</span>
                    {!item.ok ? (
                      <span className="pro-setup-step-detail">{item.detail}</span>
                    ) : null}
                  </div>
                  {!item.ok && item.actionHref ? (
                    <Link href={item.actionHref} className="pro-setup-step-link">
                      Fix →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {health ? (
          <div className="pro-setup-card pro-setup-standards">
            <div className="pro-setup-card-head font-sans">
              <p className="pro-setup-kicker">Your service level</p>
              <p className="pro-setup-title">
                {score.ready
                  ? "Meeting our operating standard"
                  : `${score.passed}/${score.total} standards met`}
              </p>
            </div>

            <div className="pro-setup-standards-list font-sans">
              {standards
                .filter((item) => item.id !== "loading")
                .map((item) => (
                  <StandardRow key={item.id} item={item} />
                ))}
            </div>

            {health.status !== "healthy" ? (
              <dl className="pro-setup-health-meta font-sans">
                <div>
                  <dt>Last call</dt>
                  <dd>{formatWhen(health.lastCallAt)}</dd>
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
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
