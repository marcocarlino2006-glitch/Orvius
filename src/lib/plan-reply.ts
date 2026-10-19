/*
  What Command tells a person after Approve or Dismiss. Only a reply that says
  exactly what happened counts; anything else is asked of the shop's own
  record (GET /api/copilot?proposalId=) before the plan can be offered again.
*/
import type { Outcome } from "@/lib/outcome";

export type ExecuteReply = { proposalId: string; summary: string; outcome: Outcome | null };

export function readExecuteReply(data: unknown, proposalId: string): ExecuteReply | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok !== true || d.proposalId !== proposalId) return null;
  const confirmation = d.confirmation as Record<string, unknown> | null | undefined;
  const summary = typeof confirmation?.summary === "string" ? confirmation.summary.trim() : "";
  if (!summary) return null;
  const outcome = d.outcome && typeof d.outcome === "object" ? (d.outcome as Outcome) : null;
  return { proposalId, summary, outcome };
}

export function readCancelReply(data: unknown, proposalId: string): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.ok === true && d.status === "cancelled" && d.proposalId === proposalId;
}

/** A bill reply counts as sent only when it names the invoice it went out on. */
export function isBillReply(data: unknown): boolean {
  return Boolean(data) && typeof data === "object" && (data as { ok?: unknown }).ok === true && typeof (data as { invoiceId?: unknown }).invoiceId === "string";
}

export function isOutcomeView(data: unknown): data is Outcome {
  return Boolean(data) && typeof data === "object" && Array.isArray((data as { stages?: unknown }).stages);
}

export type ReadBackState =
  | "done"
  | "withdrawn"
  | "superseded"
  | "failed_before_effect"
  | "waiting_for_approval"
  | "done_unrecorded"
  | "needs_check"
  | "running";

export type ReadBack = { state: ReadBackState; preview: string; outcome: Outcome | null };

const STATES = new Set<ReadBackState>(["done", "withdrawn", "superseded", "failed_before_effect", "waiting_for_approval", "done_unrecorded", "needs_check", "running"]);

export function readReadBack(data: unknown, proposalId: string): ReadBack | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const p = d.proposal as Record<string, unknown> | null | undefined;
  if (!p || p.id !== proposalId || typeof p.state !== "string" || !STATES.has(p.state as ReadBackState)) return null;
  const outcome = d.outcome && typeof d.outcome === "object" ? (d.outcome as Outcome) : null;
  return { state: p.state as ReadBackState, preview: typeof p.preview === "string" ? p.preview : "", outcome };
}

/**
 * What the card says and allows once the record has been read. Approve comes
 * back only when the record shows the plan never took effect.
 */
export function describeReadBack(state: ReadBackState): { text: string; canApprove: boolean; settled: boolean } {
  switch (state) {
    case "done":
      return { text: "It went through. The outcome below is read from the shop's record.", canApprove: false, settled: true };
    case "withdrawn":
      return { text: "This plan was dismissed. Nothing from it ran.", canApprove: false, settled: true };
    case "superseded":
      return { text: "The same plan already ran from another card, so this one won't run. The outcome below is read from the shop's record.", canApprove: false, settled: true };
    case "failed_before_effect":
      return { text: "It stopped before changing anything. You can approve it again.", canApprove: true, settled: false };
    case "waiting_for_approval":
      return { text: "It hasn't run yet. Approve or dismiss it when you're ready.", canApprove: true, settled: false };
    case "done_unrecorded":
      return { text: "It went through but wasn't fully recorded. It's flagged in Command for you to confirm.", canApprove: false, settled: true };
    case "needs_check":
      return { text: "It stopped partway. It's flagged in Command so you can say whether it happened. It won't run again on its own.", canApprove: false, settled: true };
    case "running":
      return { text: "It's still running. Check again in a moment; it won't run twice.", canApprove: false, settled: false };
  }
}
