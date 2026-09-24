"use client";

import { useMemo, useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { CommandSignals } from "@/components/command-signals";
import { OrviusPulse } from "@/components/orvius-pulse";
import { buildCommandSignals, groupWorkItems } from "@/lib/command-model";
import { useRing1 } from "@/lib/ring1-context";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Command — the control room. Five signals, one dominant work queue, and a
 * quiet Pulse. The first failed load is a failure state; later failures keep
 * the last good data on screen and mark it stale.
 */
export function Ring1CommandCenter() {
  const { data, loading, loadError, lastUpdatedAt, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);

  async function retry() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const work = useMemo(() => groupWorkItems(data?.attention ?? []), [data?.attention]);
  const signals = useMemo(
    () => (data?.commandCounts ? buildCommandSignals(data.commandCounts, work) : null),
    [data?.commandCounts, work],
  );

  if (!data && loadError && !loading) {
    return (
      <section className="cc" aria-label="Command">
        <div className="ox-state ox-state--failure" role="alert">
          <p className="ox-state-title">Command could not load</p>
          <p className="ox-state-copy">
            {loadError} Your line keeps answering calls while this screen reconnects.
          </p>
          <button type="button" className="ox-btn ox-btn--primary" disabled={refreshing} onClick={() => void retry()}>
            {refreshing ? "Retrying…" : "Retry"}
          </button>
        </div>
      </section>
    );
  }

  const counts = data?.commandCounts;
  const brief = counts
    ? [
        counts.calls + counts.messagesAndWeb > 0
          ? `Orvius handled ${plural(counts.calls + counts.messagesAndWeb, "request")} and booked ${plural(counts.booked, "job")} in the last ${counts.windowDays} days.`
          : `No calls or messages in the last ${counts.windowDays} days.`,
        work.length ? `${plural(work.length, "decision")} waiting on you.` : "Nothing is waiting on you.",
      ].join(" ")
    : null;

  return (
    <section className="cc" aria-label="Command">
      <div className="cc-main">
        <header className="cc-brief">
          <p className="cc-brief-kicker">{data?.business?.name ?? "Your shop"}</p>
          <p className="cc-brief-text">{brief ?? "Reading the shop…"}</p>
        </header>

        <CommandSignals signals={signals} loading={loading} />

        <AttentionQueue
          work={work}
          loading={loading && !data}
          technicians={data?.technicians ?? []}
          onAction={() => void refresh()}
        />

        <ApproveQueue onChange={() => void refresh()} hideWhenEmpty />
      </div>

      <aside className="cc-rail" aria-label="System status">
        <OrviusPulse
          health={data?.health}
          events={data?.shiftTimeline ?? []}
          lastUpdatedAt={lastUpdatedAt}
          stale={Boolean(loadError && data)}
          refreshing={refreshing}
          onRetry={() => void retry()}
          billingStatus={data?.business?.billingStatus}
          referenceImplementation={data?.business?.referenceImplementation}
        />
      </aside>
    </section>
  );
}
