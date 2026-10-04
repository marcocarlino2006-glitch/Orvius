"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AttentionQueue } from "@/components/attention-queue";
import { CommandSignals } from "@/components/command-signals";
import { AskBar, CommandBoard } from "@/components/command-board";
import { OrviusPulse } from "@/components/orvius-pulse";
import { buildCommandSignals, groupWorkItems } from "@/lib/command-model";
import type { AttentionItem } from "@/lib/attention-types";
import type { Handled } from "@/lib/autopilot";
import { useRing1 } from "@/lib/ring1-context";

/* A late, unstarted job is already an Exceptions card with Move, Mark done and Call tech,
   and unfinished line setup is already the banner above the board. */
function shownElsewhere(item: AttentionItem) {
  if (item.kind === "needs_capture") return true;
  return (
    (item.kind === "tech_no_show" || item.kind === "appointment_at_risk") &&
    (item.meta?.status === "scheduled" || item.meta?.status === "confirmed")
  );
}

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
 * Command — the daily workspace. One board: approvals, exceptions, requests,
 * proposals, confirmed work, and the money and crew follow-ups as its last
 * tab. The rail holds the numbers and a quiet Pulse. The first failed load is a failure state; later failures keep
 * the last good data on screen and mark it stale.
 */
export function Ring1CommandCenter({ setup }: { setup?: ReactNode }) {
  const { data, loading, loadError, lastUpdatedAt, refresh } = useRing1();
  const [refreshing, setRefreshing] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

  async function retry() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const work = useMemo(
    () =>
      groupWorkItems((data?.attention ?? []).filter((item) => !shownElsewhere(item))).filter(
        (w) => !w.id.startsWith("incident:"),
      ),
    [data?.attention],
  );
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
    <div className="cc-page">
      <section className="cc-hero" aria-labelledby="cc-hero-title">
        <h2 id="cc-hero-title" className="cc-hero-title">
          What can I do for you?
        </h2>
        <AskBar
          onChange={() => {
            setBoardKey((k) => k + 1);
            void refresh();
          }}
          below={setup}
        />
      </section>
      <section className="cc" aria-label="Command">
        <div className="cc-main">
          <header className="cc-brief">
            {brief ? (
              <div className="cc-brief-personal">
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
              </div>
            ) : (
            <p className="cc-brief-text">
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
            )}
          </header>

          <CommandBoard
            onChange={() => void refresh()}
            refreshKey={boardKey}
            extra={{
              id: "follow-ups",
              label: "Follow-ups",
              count: work.length,
              content: (
                <AttentionQueue
                  bare
                  work={work}
                  loading={loading && !data}
                  technicians={data?.technicians ?? []}
                  onAction={() => void refresh()}
                />
              ),
            }}
          />
        </div>

        <aside className="cc-rail" aria-label="System status">
          <CommandSignals signals={signals} loading={loading} />
          <OrviusPulse
            health={data?.health}
            lastUpdatedAt={lastUpdatedAt}
            stale={Boolean(loadError && data)}
            refreshing={refreshing}
            onRetry={() => void retry()}
            billingStatus={data?.business?.billingStatus}
            referenceImplementation={data?.business?.referenceImplementation}
          />
        </aside>
      </section>
    </div>
  );
}
