"use client";

import { useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { ProCommandOutcomes } from "@/components/pro-command-outcomes";
import { ProEconomicsPanel } from "@/components/pro-economics-panel";
import { ProLaunchControl } from "@/components/pro-launch-control";
import { ProShiftTimeline } from "@/components/pro-shift-timeline";
import { useRing1 } from "@/lib/ring1-context";

// Economics panel stays reachable for weekly-proof ritual code; Command calm
// shows outcomes only so money never double-stacks with the pulse.
void ProEconomicsPanel;

/**
 * Signed-in Command — one composition.
 * Work waiting: board (+ pending approvals only). Calm: one retrospect + trail.
 * Proof copy lives on the operate banner when due. Rail is quiet status.
 */
export function Ring1CommandCenter() {
  const { data, loading, loadError, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const attention = data?.attention ?? [];
  const workMode = loading || attention.length > 0;

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

        {workMode ? (
          <>
            <AttentionQueue
              items={attention}
              loading={loading}
              technicians={data?.technicians ?? []}
              onAction={() => void refresh()}
            />
            <ApproveQueue onChange={() => void refresh()} hideWhenEmpty />
          </>
        ) : (
          <>
            <ProCommandOutcomes
              outcomes={data?.outcomes}
              attentionCount={0}
              loading={false}
            />

            {(data?.shiftTimeline?.length ?? 0) > 0 ? (
              <ProShiftTimeline
                events={data?.shiftTimeline ?? []}
                loading={false}
                moneyEnabled={data?.business?.depositEnabled ?? false}
              />
            ) : null}
          </>
        )}
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
