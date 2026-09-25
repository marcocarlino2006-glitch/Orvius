"use client";

import { useMemo, useState } from "react";
import { ApproveQueue } from "@/components/approve-queue";
import { AttentionQueue } from "@/components/attention-queue";
import { CommandSignals } from "@/components/command-signals";
import { OrviusPulse } from "@/components/orvius-pulse";
import { buildCommandSignals, groupWorkItems } from "@/lib/command-model";
import type { Handled } from "@/lib/autopilot";
import { useRing1 } from "@/lib/ring1-context";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function activityParts(h: Handled | undefined, counts: NonNullable<ReturnType<typeof useRing1>["data"]>["commandCounts"]) {
  const parts = h
    ? [
        h.calls ? plural(h.calls, "call") + " answered" : null,
        h.booked ? plural(h.booked, "job") + " booked" : null,
        h.assigned ? plural(h.assigned, "technician") + " assigned" : null,
        h.confirmations ? plural(h.confirmations, "confirmation") + " sent" : null,
        h.escalated ? plural(h.escalated, "call") + " flagged" : null,
      ].filter((p): p is string => Boolean(p))
    : [];
  if (parts.length) return { window: "Last 24 hours", parts };
  if (!counts) return null;
  const requests = counts.calls + counts.messagesAndWeb;
  return {
    window: `Last ${counts.windowDays} days`,
    parts: requests ? [plural(requests, "request"), plural(counts.booked, "job") + " booked"] : ["No calls or messages"],
  };
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
  const activity = counts ? activityParts(data?.handled, counts) : null;
  const brief = data?.personalBrief ?? null;

  return (
    <section className="cc" aria-label="Command">
      <div className="cc-main">
        <header className="cc-brief">
          {brief ? (
            <div className="cc-brief-personal">
              <p className="cc-brief-greeting">{brief.greeting}</p>
              <p className="cc-brief-headline">{brief.headline}</p>
              {brief.detail.length ? (
                <p className="cc-brief-detail">
                  {brief.detail.map((line) => (
                    <span key={line} className="cc-brief-part">
                      {line}
                    </span>
                  ))}
                </p>
              ) : null}
              {brief.pattern ? <p className="cc-brief-pattern">{brief.pattern}</p> : null}
            </div>
          ) : null}
          <p className={brief ? "cc-brief-text cc-brief-text--sub" : "cc-brief-text"}>
            {activity ? (
              <>
                <span className="cc-brief-window">{activity.window}</span>
                {activity.parts.map((part) => (
                  <span key={part} className="cc-brief-part">
                    {part}
                  </span>
                ))}
              </>
            ) : (
              "Reading the shop…"
            )}
          </p>
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
