"use client";

import { useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { CommandWorkflowStrip } from "@/components/command-workflow-strip";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { ProCommandOutcomes } from "@/components/pro-command-outcomes";
import { ProLaunchControl } from "@/components/pro-launch-control";
import { ProShiftTimeline } from "@/components/pro-shift-timeline";
import { usePlanAccess } from "@/lib/use-plan-access";
import { useRing1 } from "@/lib/ring1-context";

function nextUpcomingAppointment(
  jobs:
    | Array<{
        id: string;
        title: string;
        scheduledAt: string | null;
        customer?: { name: string | null } | null;
        lead?: { name: string | null } | null;
      }>
    | undefined,
) {
  if (!jobs?.length) return null;
  const now = Date.now();
  const upcoming = jobs
    .filter((job) => job.scheduledAt && new Date(job.scheduledAt).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    );
  const next = upcoming[0];
  if (!next?.scheduledAt) return null;
  return {
    id: next.id,
    title: next.title,
    scheduledAt: next.scheduledAt,
    customerName: next.customer?.name ?? next.lead?.name ?? null,
  };
}

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
  const revenueAtRiskCents = attention.reduce(
    (sum, item) => sum + (item.estimatedRevenueCents ?? 0),
    0,
  );

  return (
    <section className="ring1-command ring1-cockpit" aria-label="Command">
      <div className="ring1-cockpit-main">
        {loadError ? (
          <div className="pro-command-recovery font-sans" role="alert">
            <div>
              <strong>Command could not refresh</strong>
              <span className="pro-command-recovery-row">
                <span className="clarity-purpose-label">Cause</span> {loadError}
              </span>
              <span className="pro-command-recovery-row">
                <span className="clarity-purpose-label">Impact</span> Tonight’s
                queue and outcomes may be stale until this reconnects.
              </span>
              <span className="pro-command-recovery-row">
                <span className="clarity-purpose-label">Recover</span> Retry now —
                your shop line is still answering calls.
              </span>
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
          today={data?.today}
          outcomes={data?.outcomes}
          attentionCount={attention.length}
          loading={loading}
          lineVerified={data?.health?.lineVerified}
          line={data?.business?.line}
          setupReady={data?.wedge?.ready}
        />

        <CommandWorkflowStrip
          today={data?.today}
          alertsProven={data?.workflow?.alertsProven}
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
          unresolvedCount={attention.length}
          revenueAtRiskCents={revenueAtRiskCents || null}
          nextAppointment={nextUpcomingAppointment(data?.dispatchToday?.jobs)}
        />
      </aside>
    </section>
  );
}
