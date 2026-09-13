"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { ProEmptyState, ProSectionHead } from "@/components/pro-page-chrome";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { ProLineWatch } from "@/components/pro-line-watch";
import { ProNightWatch, type CoverageState } from "@/components/pro-night-watch";
import { ProSetupScore } from "@/components/pro-setup-score";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { ProTodayAlerts } from "@/components/pro-today-status";
import { usePlanAccess } from "@/lib/use-plan-access";
import type { AttentionItem } from "@/lib/attention-types";
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type Ring1Data = {
  metrics: {
    newLeads: number;
  };
  outcomes?: ShopOutcomes;
  attention?: AttentionItem[];
  dispatchToday: {
    jobCount: number;
    unassigned: number;
    jobs: Array<{
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
      address: string | null;
      urgency: string | null;
      technicianId?: string | null;
      technician?: { name: string } | null;
      customer?: { name: string | null; phone: string } | null;
      lead?: { name: string | null; phone: string | null } | null;
    }>;
  };
  technicians?: Array<{ id: string; name: string }>;
  health?: ShopHealth;
  wedge?: WedgeReadiness;
  coverage?: CoverageState;
  lastWeeklyProofAt?: string | null;
  gates?: {
    certDone: number;
    certTotal: number;
    certIncomplete: boolean;
    economicsReady: boolean;
    proofStale: boolean;
    pilotDaysLeft: number;
    checkoutReady: boolean;
  };
};

const REFRESH_MS = 30_000;

export function Ring1CommandCenter() {
  const [data, setData] = useState<Ring1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const { access } = usePlanAccess();
  const canDispatch = access?.canAccess("dispatch") ?? false;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      /* keep last good data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const newLeads = data?.metrics.newLeads ?? 0;
  const attention = data?.attention ?? [];
  const hasDispatchWork =
    canDispatch &&
    Boolean(data?.dispatchToday) &&
    ((data?.dispatchToday.unassigned ?? 0) > 0 ||
      (data?.dispatchToday.jobCount ?? 0) > 0);

  const attentionCoversGates = attention.some((item) =>
    ["billing_action", "founder_cert", "missing_baseline", "stale_weekly_proof", "alert_failed", "needs_capture"].includes(
      item.kind,
    ),
  );

  const empty =
    !loading &&
    attention.length === 0 &&
    !hasDispatchWork &&
    !(data?.health?.failedAlerts24h) &&
    !(data?.health?.stuckPendingAlerts) &&
    !(data?.wedge && !data.wedge.ready);

  /*
    The board opens the page. A four-tile "Right now" strip used to sit above
    it restating the rail beside it almost line for line — its alert-speed and
    last-call tiles were the same sentences as Line watch — and on a quiet
    shop three of its four tiles were zeros. Four boxes of restated status is
    not what a command centre should show first.
  */
  return (
    <section className="ring1-command ring1-cockpit" aria-label="Command">
      <div className="ring1-cockpit-main">
        <ApproveQueue onChange={load} />

        <AttentionQueue
          items={attention}
          loading={loading}
          technicians={data?.technicians ?? []}
          onAction={load}
        />

        {!loading && data?.outcomes ? (
          <ProEconomicsPanel
            outcomes={data.outcomes}
            lastWeeklyProofAt={data.lastWeeklyProofAt}
            proofOnBoard={attention.some((i) => i.kind === "stale_weekly_proof")}
          />
        ) : null}

        {canDispatch && data?.dispatchToday ? (
          <ProDispatchToday
            jobs={data.dispatchToday.jobs}
            unassigned={data.dispatchToday.unassigned}
            jobCount={data.dispatchToday.jobCount}
            technicians={data.technicians ?? []}
            onUpdate={load}
          />
        ) : null}

        {empty ? (
          <div className="ring1-recent">
            <ProSectionHead kicker="Field" title="Nothing waiting on the board" />
            <ProEmptyState
              title="Run a test call"
              body="Orvius ranks urgent leads, unassigned jobs, and overdue follow-ups here when they land."
              action={
                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                    Inbox
                  </Link>
                  <ProShopLineCta label="Test your line" showNumber={false} variant="secondary" />
                </div>
              }
            />
          </div>
        ) : null}
      </div>

      <aside className="ring1-cockpit-rail" aria-label="Shop status">
        <ProNightWatch coverage={data?.coverage ?? null} outcomes={data?.outcomes ?? null} />
        <ProLineWatch health={data?.health ?? null} />
        <ProSetupScore wedge={data?.wedge ?? null} />

        {!attentionCoversGates ? (
          <ProTodayAlerts
            health={data?.health ?? null}
            wedge={data?.wedge ?? null}
            newLeads={newLeads}
            economicsReady={data?.gates?.economicsReady ?? true}
            proofStale={data?.gates?.proofStale ?? false}
            certIncomplete={data?.gates?.certIncomplete ?? false}
            pilotDaysLeft={data?.gates?.pilotDaysLeft ?? null}
            checkoutReady={data?.gates?.checkoutReady ?? true}
          />
        ) : null}
      </aside>
    </section>
  );
}
