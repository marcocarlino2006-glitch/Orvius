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

export type CopilotRecommendation = {
  action: "assign_tech" | "sms_followup" | "mark_contacted";
  label: string;
  reason: string;
  jobId?: string;
  leadId?: string;
  technicianId?: string;
};

type Confirmation = { summary: string; at: string };

type CopilotActionsProps = {
  hits?: CopilotHit[];
  /** The one action Orvius recommends; manual actions fold behind it. */
  recommendation?: CopilotRecommendation | null;
  /** Compact dock layout */
  compact?: boolean;
};

export function CopilotActions({ hits = [], compact, recommendation }: CopilotActionsProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [crew, setCrew] = useState<Tech[]>([]);
  const [techId, setTechId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  const jobHits = hits.filter((h) => h.type === "job");
  const leadHits = hits.filter((h) => h.type === "lead");
  const show =
    proposal || recommendation || jobHits.length > 0 || leadHits.length > 0;

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
      setDone({
        summary: data.confirmation?.summary ?? proposal.preview,
        at: data.confirmation?.at ?? new Date().toISOString(),
      });
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

  const manual = (
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
                className="ox-btn ox-btn--quiet ox-btn--sm"
                disabled={busy || !techId}
                onClick={() =>
                  void propose({
                    action: "assign_tech",
                    jobId: job.id,
                    technicianId: techId,
                  })
                }
              >
                Draft assignment
              </button>
            </div>
          ))}
          {leadHits.slice(0, 2).map((lead) => (
            <div key={lead.id} className="copilot-action-row">
              <span className="copilot-action-label">Follow up · {lead.title}</span>
              <button
                type="button"
                className="ox-btn ox-btn--quiet ox-btn--sm"
                disabled={busy}
                onClick={() =>
                  void propose({ action: "sms_followup", leadId: lead.id })
                }
              >
                Draft follow-up text
              </button>
              <button
                type="button"
                className="ox-btn ox-btn--quiet ox-btn--sm"
                disabled={busy}
                onClick={() =>
                  void propose({ action: "mark_contacted", leadId: lead.id })
                }
              >
                Draft “contacted”
              </button>
            </div>
          ))}
    </div>
  );

  function previewRecommendation() {
    if (!recommendation) return;
    const body: Record<string, string> = { action: recommendation.action };
    if (recommendation.jobId) body.jobId = recommendation.jobId;
    if (recommendation.leadId) body.leadId = recommendation.leadId;
    if (recommendation.technicianId) body.technicianId = recommendation.technicianId;
    void propose(body);
  }

  return (
    <div className={`copilot-actions font-sans ${compact ? "copilot-actions-compact" : ""}`}>
      <p className="copilot-actions-kicker">{recommendation ? "Recommended next action" : "Proposed actions"}</p>

      {done ? (
        <p className="copilot-actions-done" role="status">
          Done — {done.summary} Recorded in the timeline at{" "}
          {new Date(done.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
        </p>
      ) : null}
      {error ? (
        <div className="copilot-actions-error" role="alert">
          <p>{error} Nothing was changed.</p>
          {proposal ? (
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void execute()}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {proposal ? (
        <div className="copilot-proposal">
          <p className="copilot-proposal-label">What will happen</p>
          <p className="copilot-proposal-preview">{proposal.preview}</p>
          <div className="copilot-proposal-btns">
            <button
              type="button"
              className="ox-btn ox-btn--primary ox-btn--sm"
              disabled={busy}
              onClick={() => void execute()}
            >
              {busy ? "Working…" : "Approve and run"}
            </button>
            <button
              type="button"
              className="ox-btn ox-btn--quiet ox-btn--sm"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Don’t run
            </button>
          </div>
        </div>
      ) : done ? null : recommendation ? (
        <>
          <div className="copilot-recommend">
            <p className="copilot-recommend-label">{recommendation.label}</p>
            <p className="copilot-recommend-reason">{recommendation.reason}</p>
            <button
              type="button"
              className="ox-btn ox-btn--primary ox-btn--sm"
              disabled={busy}
              onClick={previewRecommendation}
            >
              {busy ? "Preparing…" : "Preview changes"}
            </button>
            <p className="copilot-actions-lead">Nothing runs until you approve. Every decision is kept in the timeline.</p>
          </div>
          {jobHits.length || leadHits.length ? (
            <details className="copilot-more">
              <summary>Other actions</summary>
              {manual}
            </details>
          ) : null}
        </>
      ) : (
        <>
          <p className="copilot-actions-lead">
            Orvius drafts the action and shows exactly what will happen. Nothing runs until you approve,
            and every decision is kept in the timeline.
          </p>
          {manual}
        </>
      )}
    </div>
  );
}
