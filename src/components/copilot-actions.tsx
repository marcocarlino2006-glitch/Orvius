"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  proposalId: string;
  action: string;
  preview: string;
};

type Tech = { id: string; name: string; phone: string | null };

type CopilotHit = {
  type: string;
  id: string;
  title: string;
};

type CopilotActionsProps = {
  hits?: CopilotHit[];
  /** Compact dock layout */
  compact?: boolean;
};

export function CopilotActions({ hits = [], compact }: CopilotActionsProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [crew, setCrew] = useState<Tech[]>([]);
  const [techId, setTechId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const jobHits = hits.filter((h) => h.type === "job");
  const leadHits = hits.filter((h) => h.type === "lead");
  const show =
    proposal || jobHits.length > 0 || leadHits.length > 0;

  useEffect(() => {
    if (!jobHits.length) return;
    fetch("/api/technicians")
      .then((res) => (res.ok ? res.json() : { technicians: [] }))
      .then((data) => {
        const list = (data.technicians ?? []) as Tech[];
        setCrew(list);
        if (list[0]) setTechId(list[0].id);
      })
      .catch(() => undefined);
  }, [jobHits.length]);

  const propose = useCallback(
    async (body: Record<string, string>) => {
      setBusy(true);
      setError(null);
      setDone(null);
      try {
        const res = await fetch("/api/copilot?mode=propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not propose");
        setProposal({
          proposalId: data.proposalId,
          action: data.action,
          preview: data.preview,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not propose");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  async function execute() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot?mode=execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.proposalId, approved: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Execute failed");
      setDone(proposal.preview);
      setProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execute failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot?mode=cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      setProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className={`copilot-actions font-sans ${compact ? "copilot-actions-compact" : ""}`}>
      <p className="copilot-actions-kicker">Approve before Orvius acts</p>

      {done ? <p className="copilot-actions-done">Done: {done}</p> : null}
      {error ? <p className="copilot-actions-error">{error}</p> : null}

      {proposal ? (
        <div className="copilot-proposal">
          <p className="copilot-proposal-preview">{proposal.preview}</p>
          <div className="copilot-proposal-btns">
            <button
              type="button"
              className="btn btn-void text-sm"
              disabled={busy}
              onClick={() => void execute()}
            >
              {busy ? "Working…" : "Approve & run"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="copilot-action-list">
          {jobHits.slice(0, 2).map((job) => (
            <div key={job.id} className="copilot-action-row">
              <span className="copilot-action-label">Assign · {job.title}</span>
              {crew.length ? (
                <select
                  className="input copilot-tech-select"
                  value={techId}
                  onChange={(e) => setTechId(e.target.value)}
                  disabled={busy}
                >
                  {crew.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy || !techId}
                onClick={() =>
                  void propose({
                    action: "assign_tech",
                    jobId: job.id,
                    technicianId: techId,
                  })
                }
              >
                Propose assign
              </button>
            </div>
          ))}
          {leadHits.slice(0, 2).map((lead) => (
            <div key={lead.id} className="copilot-action-row">
              <span className="copilot-action-label">Follow up · {lead.title}</span>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  void propose({ action: "sms_followup", leadId: lead.id })
                }
              >
                Propose SMS
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  void propose({ action: "mark_contacted", leadId: lead.id })
                }
              >
                Propose contacted
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
