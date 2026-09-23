"use client";

import { useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { OpsBriefing } from "@/components/ops-briefing";
import { ProLaunchControl } from "@/components/pro-launch-control";
import { ProShiftTimeline } from "@/components/pro-shift-timeline";
import { useRing1 } from "@/lib/ring1-context";

/**
 * Command = AI operating console for the shop.
 * Briefing always visible; attention + approvals are the action layer;
 * timeline is evidence. Never XOR the board away from the business pulse.
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
  const attentionRevenueCents = attention.reduce(
    (sum, item) => sum + (item.estimatedRevenueCents ?? 0),
    0,
  );

  return (
    <section className="ring1-command ring1-cockpit" aria-label="Command">
      <div className="ring1-cockpit-main">
        {loadError ? (
          <div className="pro-command-recovery font-sans" role="alert">
            <div>
              <strong>Connection needs attention</strong>
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

        <OpsBriefing
          outcomes={data?.outcomes}
          attentionCount={attention.length}
          attentionRevenueCents={attentionRevenueCents}
          loading={loading}
        />

        <AttentionQueue
          items={attention}
          loading={loading}
          technicians={data?.technicians ?? []}
          onAction={() => void refresh()}
        />

        <ApproveQueue onChange={() => void refresh()} hideWhenEmpty />

        <ProShiftTimeline
          events={data?.shiftTimeline ?? []}
          loading={loading}
          moneyEnabled={data?.business?.depositEnabled ?? false}
        />
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
