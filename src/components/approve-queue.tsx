"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  id: string;
  action: string;
  preview: string;
  createdAt: string;
};

/**
 * Approve-first queue — high-risk Copilot proposals waiting on the owner.
 */
export function ApproveQueue({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Proposal[]>([]);
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
      setItems((prev) => prev.filter((p) => p.id !== proposalId));
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && items.length === 0) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="approve-queue font-sans" aria-label="Approve queue">
      <header className="approve-queue-head">
        <p className="approve-queue-kicker">Approve first</p>
        <h2 className="approve-queue-title">Needs your OK</h2>
        <p className="approve-queue-lead">
          High-risk moves stay queued until you approve. Autonomy with overrides.
        </p>
      </header>

      {error ? <p className="approve-queue-error">{error}</p> : null}

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
    </section>
  );
}
