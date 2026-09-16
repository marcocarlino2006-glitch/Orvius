"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { ProEmptyState, ProSectionHead } from "@/components/pro-page-chrome";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { ProCommandOutcomes } from "@/components/pro-command-outcomes";
import { ProLaunchControl } from "@/components/pro-launch-control";
import type { CoverageState } from "@/components/pro-night-watch";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { ProShiftTimeline } from "@/components/pro-shift-timeline";
import { usePlanAccess } from "@/lib/use-plan-access";
import type { AttentionItem } from "@/lib/attention-types";
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type Ring1Data = {
  business?: {
    billingStatus?: string | null;
    depositEnabled?: boolean;
    referenceImplementation?: boolean;
  };
  metrics: {
    newLeads: number;
  };
  outcomes?: ShopOutcomes;
  shiftTimeline?: ShiftEvent[];
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { access } = usePlanAccess();
  const canDispatch = access?.canAccess("dispatch") ?? false;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again to refresh Command."
            : "Command could not refresh.",
        );
      }
      const json = await res.json();
      setData(json);
      setLoadError(null);
    } catch {
      setLoadError(
        "Live refresh is temporarily unavailable. Existing information remains visible.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const attention = data?.attention ?? [];
  const hasDispatchWork =
    canDispatch &&
    Boolean(data?.dispatchToday) &&
    ((data?.dispatchToday.unassigned ?? 0) > 0 ||
      (data?.dispatchToday.jobCount ?? 0) > 0);

  const empty =
    !loading &&
    attention.length === 0 &&
    !hasDispatchWork &&
    !(data?.health?.failedAlerts24h) &&
    !(data?.health?.stuckPendingAlerts) &&
    !(data?.wedge && !data.wedge.ready);

  return (
    <section className="ring1-command ring1-cockpit" aria-label="Command">
      <div className="ring1-cockpit-main">
        {loadError ? (
          <div className="pro-command-recovery font-sans" role="alert">
            <div>
              <strong>Connection needs attention</strong>
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            >
              {refreshing ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : null}

        <ProCommandOutcomes
          outcomes={data?.outcomes}
          attentionCount={attention.length}
          loading={loading}
        />

        <AttentionQueue
          items={attention}
          loading={loading}
          technicians={data?.technicians ?? []}
          onAction={load}
        />

        {loading || (data?.shiftTimeline?.length ?? 0) > 0 ? (
          <ProShiftTimeline
            events={data?.shiftTimeline ?? []}
            loading={loading}
            moneyEnabled={data?.business?.depositEnabled ?? false}
          />
        ) : null}

        <ApproveQueue onChange={load} hideWhenEmpty />

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
        <ProLaunchControl
          wedge={data?.wedge}
          events={data?.shiftTimeline ?? []}
          moneyEnabled={data?.business?.depositEnabled ?? false}
          checkoutReady={data?.gates?.checkoutReady ?? false}
          billingStatus={data?.business?.billingStatus}
          referenceImplementation={data?.business?.referenceImplementation}
          coverage={data?.coverage}
          health={data?.health}
          outcomes={data?.outcomes}
        />
      </aside>
    </section>
  );
}
