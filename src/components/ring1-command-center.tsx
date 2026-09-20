"use client";

import Link from "next/link";
import { useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { ProEmptyState, ProSectionHead } from "@/components/pro-page-chrome";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { ProCommandOutcomes } from "@/components/pro-command-outcomes";
import { ProLaunchControl } from "@/components/pro-launch-control";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { ProShiftTimeline } from "@/components/pro-shift-timeline";
import { usePlanAccess } from "@/lib/use-plan-access";
import { useRing1 } from "@/lib/ring1-context";

export function Ring1CommandCenter() {
  const { data, loading, loadError, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);
  const { access } = usePlanAccess();
  const canDispatch = access?.canAccess("dispatch") ?? false;

  async function load() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const attention = data?.attention ?? [];
  const hasDispatchWork =
    canDispatch &&
    ((data?.dispatchToday?.unassigned ?? 0) > 0 ||
      (data?.dispatchToday?.jobCount ?? 0) > 0);

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
              onClick={() => void load()}
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
          onAction={() => void refresh()}
        />

        {loading || (data?.shiftTimeline?.length ?? 0) > 0 ? (
          <ProShiftTimeline
            events={data?.shiftTimeline ?? []}
            loading={loading}
            moneyEnabled={data?.business?.depositEnabled ?? false}
          />
        ) : null}

        <ApproveQueue onChange={() => void refresh()} hideWhenEmpty />

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
            onUpdate={() => void refresh()}
          />
        ) : null}

        {empty ? (
          <div className="ring1-recent">
            <ProSectionHead kicker="Field" title="Nothing waiting on the board" />
            <ProEmptyState
              title="Board is clear"
              body="When a night call lands, Orvius puts the lead here so you can book, assign, or call back without hunting."
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
