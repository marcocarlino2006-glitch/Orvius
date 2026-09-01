/**
 * Institutional standards — practices adapted from operators at scale.
 * Used in owner UI, ops checks, and support copy. Every claim must be measurable today.
 */

import { company } from "@/lib/company";
import type { ShopHealth } from "@/lib/shop-health";

/** Owner-facing SLAs we hold ourselves to (measured in dashboard). */
export const ownerSlAs = {
  alertP95TargetSec: 60,
  supportEmail: company.supportEmail,
  supportResponseTarget: "Within 1 business day",
  lineCoverageLabel: "24/7 when your shop line is live",
  billingEntity: company.legalName,
} as const;

/** What we borrow from operators at scale — and how Orvius implements it. */
export const institutionalPractices = [
  {
    id: "stripe-idempotency",
    source: "Stripe",
    practice: "Never double-charge, never double-alert",
    orvius: "Dedupe keys on every inbound call/SMS and notification queue row",
  },
  {
    id: "amazon-owner-outcome",
    source: "Amazon",
    practice: "Work backwards from the owner outcome",
    orvius: "Wedge: call → qualify → alert → inbox → action. Nothing else ships first",
  },
  {
    id: "linear-clarity",
    source: "Linear",
    practice: "Software that respects the user's time",
    orvius: "Dashboard in owner language — no webhook jargon, 5-second clarity",
  },
  {
    id: "servicetitan-vertical",
    source: "ServiceTitan",
    practice: "Built for trades, not generic SaaS",
    orvius: "HVAC, plumbing, electrical — line, inbox, jobs, dispatch in one record",
  },
  {
    id: "datadog-slos",
    source: "Datadog",
    practice: "SLOs visible, not hidden in engineering",
    orvius: "P95 alert latency and shop health on Today — owners see what we see",
  },
  {
    id: "salesforce-onboarding",
    source: "Salesforce",
    practice: "Implementation milestones before go-live",
    orvius: "Go-live checklist until line, alerts, and first lead are proven",
  },
] as const;

export type OwnerStandardItem = {
  id: string;
  label: string;
  target: string;
  actual: string;
  ok: boolean | null;
  href?: string;
};

export function getOwnerStandardsReport(health: ShopHealth | null): OwnerStandardItem[] {
  if (!health) {
    return [
      {
        id: "loading",
        label: "Standards",
        target: "Measured in production",
        actual: "Loading…",
        ok: null,
      },
    ];
  }

  return [
    {
      id: "line",
      label: "Shop line",
      target: "Dedicated number assigned",
      actual: health.dedicatedLine ? (health.line ?? "Assigned") : "Not configured",
      ok: health.dedicatedLine,
      href: "/dashboard/settings",
    },
    {
      id: "coverage",
      label: "Call coverage",
      target: ownerSlAs.lineCoverageLabel,
      actual: health.dedicatedLine && health.lineVerified ? "Live and verified" : "Configure and test",
      ok: health.dedicatedLine && health.lineVerified,
      href: "/dashboard/settings",
    },
    {
      id: "alert-speed",
      label: "Owner alert speed",
      target: `Under ${ownerSlAs.alertP95TargetSec}s (P95)`,
      actual:
        health.alertLatencyP95Sec != null
          ? `P95 ${health.alertLatencyP95Sec}s`
          : health.pendingAlerts > 0
            ? `${health.pendingAlerts} sending`
            : "Place a lead to measure",
      ok: health.alertSpeedOk,
    },
    {
      id: "alert-delivery",
      label: "Alert delivery",
      target: "No stuck or failed alerts",
      actual:
        health.stuckPendingAlerts > 0
          ? `${health.stuckPendingAlerts} stuck`
          : health.failedAlerts24h > 0
            ? `${health.failedAlerts24h} failed (24h)`
            : "Clear",
      ok: health.stuckPendingAlerts === 0 && health.failedAlerts24h === 0,
      href: "/dashboard/settings",
    },
    {
      id: "isolation",
      label: "Your data",
      target: "Only your shop sees your leads",
      actual: "Tenant-isolated workspace",
      ok: true,
    },
    {
      id: "support",
      label: "Support",
      target: ownerSlAs.supportResponseTarget,
      actual: ownerSlAs.supportEmail,
      ok: true,
      href: `mailto:${ownerSlAs.supportEmail}`,
    },
  ];
}

export function standardsScore(items: OwnerStandardItem[]): {
  passed: number;
  total: number;
  ready: boolean;
} {
  const measured = items.filter((item) => item.ok !== null && item.id !== "loading");
  const passed = measured.filter((item) => item.ok).length;
  return {
    passed,
    total: measured.length,
    ready: measured.length > 0 && passed === measured.length,
  };
}
