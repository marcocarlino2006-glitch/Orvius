"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  id: string;
  action: string;
  preview: string;
  createdAt: string;
};

type Activity = Proposal & {
  status: "executed" | "cancelled";
  executedAt: string | null;
};

/**
 * Agent control — high-risk moves wait for approval, and every resolved move
 * stays visible afterward. The audit trail is as important as the button:
 * autonomy without evidence is just another black box.
 */
export function ApproveQueue({
  onChange,
  hideWhenEmpty = false,
}: {
  onChange?: () => void;
  hideWhenEmpty?: boolean;
}) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot");
      if (!res.ok) return;
      const data = await res.json();
      setItems(
        (data.proposals ?? []).map(
          (p: {
            id: string;
            action: string;
            preview: string;
            createdAt: string;
          }) => ({
            id: p.id,
            action: p.action,
            preview: p.preview,
            createdAt: p.createdAt,
          }),
        ),
      );
      setActivity(
        (data.activity ?? []).map(
          (item: {
            id: string;
            action: string;
            preview: string;
            status: "executed" | "cancelled";
            createdAt: string;
            executedAt: string | null;
          }) => item,
        ),
      );
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  async function act(proposalId: string, mode: "execute" | "cancel") {
    setBusyId(proposalId);
    setError(null);
    try {
      const res = await fetch(`/api/copilot?mode=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "execute"
            ? { proposalId, approved: true }
            : { proposalId },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const hasApprovals = items.length > 0;
  const hasActivity = activity.length > 0;
  const isEmpty = !loading && !hasApprovals && !hasActivity;

  // When Command is in work mode, only pending approvals belong under the board —
  // activity history is audit landfill next to live CTAs.
  if (hideWhenEmpty && !hasApprovals) return null;

  return (
    <section
      id="agent-control"
      className="approve-queue font-sans"
      aria-label="Agent control"
      aria-busy={loading}
    >
      <header className="approve-queue-head">
        <p className="approve-queue-kicker">Agent control</p>
        <h2 className="approve-queue-title">
          {loading && !hasApprovals && !hasActivity
            ? "Checking agent activity"
            : hasApprovals
              ? "Needs your OK"
              : hasActivity
                ? "Recent agent activity"
                : "No approvals waiting"}
        </h2>
        <p className="approve-queue-lead">
          {hasApprovals
            ? "High-risk moves wait for approval. Every decision stays in the audit trail."
            : hasActivity
              ? "What the agent proposed, what ran, and what you dismissed."
              : loading
                ? "Reading the shop's approval queue and audit trail."
                : "Routine work runs inside your rules. High-risk moves stop here before they run."}
        </p>
      </header>

      {error ? <p className="approve-queue-error">{error}</p> : null}

      {isEmpty ? (
        <div className="agent-control-clear">
          <span aria-hidden />
          <p>Guardrails active</p>
        </div>
      ) : null}

      {hasApprovals ? (
        <ul className="approve-queue-list">
          {items.map((item) => (
            <li key={item.id} className="approve-queue-item">
              <p className="approve-queue-action">{item.action.replace(/_/g, " ")}</p>
              <p className="approve-queue-preview">{item.preview}</p>
              <div className="approve-queue-actions">
                <button
                  type="button"
                  className="btn btn-void text-sm"
                  disabled={busyId === item.id}
                  onClick={() => void act(item.id, "execute")}
                >
                  {busyId === item.id ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={busyId === item.id}
                  onClick={() => void act(item.id, "cancel")}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {hasActivity ? (
        <div className="agent-activity">
          {hasApprovals ? (
            <p className="agent-activity-title">Recent audit trail</p>
          ) : null}
          <ol className="agent-activity-list">
            {activity.map((item) => {
              const at = item.executedAt ?? item.createdAt;
              return (
                <li key={item.id}>
                  <span
                    className={`agent-activity-status agent-activity-status--${item.status}`}
                  >
                    {item.status === "executed" ? "Executed" : "Dismissed"}
                  </span>
                  <div>
                    <p>{item.preview}</p>
                    <span>
                      {item.action.replace(/_/g, " ")} ·{" "}
                      <time dateTime={at}>
                        {new Date(at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
