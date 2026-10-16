import { recordAudit } from "@/lib/audit";
import { collectedCents } from "@/lib/payment-math";
import type { Outcome, OutcomeStage } from "@/lib/outcome";
import { prisma } from "@/lib/prisma";

/*
  Reporting events for one request's path from booking to money. They are
  written where the owner acts (Command's approve, marking work done) from the
  outcome the records already show, keyed so a retry or a second look writes
  nothing new. Each carries the record's own time, so a stage counts when it
  happened, not when someone looked. Demo and test shops are marked synthetic
  here on the server, never by the browser.
*/

const EXCEPTION_STATES = new Set<OutcomeStage["state"]>(["failed", "unknown", "blocked"]);

export type WorkflowDecision = "approved_plan" | "recorded_completion" | "chose_assignment" | "resolved_exception";

function key(outcome: Outcome) {
  return outcome.jobId ?? outcome.leadId ?? "none";
}

/** Stage completions, new exceptions, and exceptions that cleared, for one outcome. Idempotent. */
export async function recordWorkflowProgress(outcome: Outcome, by: { actor: "owner" | "teammate" | "system"; email?: string | null }) {
  const id = key(outcome);
  const base = {
    businessId: outcome.businessId,
    entityType: outcome.jobId ? ("job" as const) : ("lead" as const),
    entityId: id,
    jobId: outcome.jobId,
    leadId: outcome.leadId,
    /* What the records show is an observation; the person whose action prompted the look did not do the stage. */
    actor: "system" as const,
    actorEmail: null,
  };
  const prompted = { promptedBy: by.actor, promptedByEmail: by.email ?? null };
  const earlier = await prisma.auditEvent.findMany({
    where: { businessId: outcome.businessId, action: "workflow.exception", entityId: id },
    select: { detailJson: true },
  });
  const raised = new Set(
    earlier.map((e) => {
      try {
        return (JSON.parse(e.detailJson ?? "{}") as { stage?: string }).stage ?? "";
      } catch {
        return "";
      }
    }),
  );
  for (const s of outcome.stages) {
    const detail = { stage: s.stage, state: s.state, at: s.at, source: s.source, execution: s.execution, synthetic: outcome.synthetic, ...prompted };
    if (s.state === "done") {
      await recordAudit({ ...base, action: "workflow.stage_done", summary: `${s.label}: ${s.evidence}`, detail, idempotencyKey: `workflow:${id}:${s.stage}:done` });
      if (raised.has(s.stage)) {
        await recordAudit({ ...base, action: "workflow.recovered", summary: `${s.label} recovered: ${s.evidence}`, detail, idempotencyKey: `workflow:${id}:${s.stage}:recovered` });
      }
    } else if (EXCEPTION_STATES.has(s.state)) {
      await recordAudit({
        ...base,
        action: "workflow.exception",
        summary: `${s.label} ${s.state}: ${s.blocker ?? s.evidence}`,
        detail,
        idempotencyKey: `workflow:${id}:${s.stage}:${s.state}`,
      });
    }
  }
}

/** The start of one request's workflow: the first time the shop acts on it. */
export async function recordWorkflowStart(outcome: Outcome, by: { actor: "owner" | "teammate"; email: string }, via: string) {
  if (!outcome.leadId && !outcome.jobId) return;
  await recordAudit({
    businessId: outcome.businessId,
    entityType: outcome.leadId ? "lead" : "job",
    entityId: outcome.leadId ?? outcome.jobId!,
    leadId: outcome.leadId,
    jobId: outcome.jobId,
    action: "workflow.started",
    actor: by.actor,
    actorEmail: by.email,
    summary: `Started from ${via}`,
    detail: { via, synthetic: outcome.synthetic },
    idempotencyKey: `workflow:${outcome.leadId ?? outcome.jobId}:started`,
  });
}

export async function recordWorkflowDecision(outcome: Outcome, decision: WorkflowDecision, by: { actor: "owner" | "teammate"; email: string }, ref: string) {
  await recordAudit({
    businessId: outcome.businessId,
    entityType: outcome.jobId ? "job" : "lead",
    entityId: key(outcome),
    leadId: outcome.leadId,
    jobId: outcome.jobId,
    action: "workflow.decision",
    actor: by.actor,
    actorEmail: by.email,
    summary: decision.replace(/_/g, " "),
    detail: { decision, synthetic: outcome.synthetic },
    idempotencyKey: `workflow:${key(outcome)}:decision:${decision}:${ref}`,
  });
}

export type WorkflowReport = {
  synthetic: boolean;
  started: number;
  /** Jobs a person marked done, with what happened. */
  completedJobs: number;
  /** Money on Payment rows that Stripe or a person recorded as collected; claims and estimates are not counted. */
  collectedCents: number;
  /** Completed jobs that came from a call Orvius answered or a booking approved in Command. */
  attributableJobs: number;
  ownerDecisions: number;
  exceptions: number;
  recovered: number;
  /** From the record times on the events: start to completion, per job, in ms. */
  startToCompleteMs: number[];
};

/**
 * One shop's numbers for a window, kept apart: jobs finished, money in, and
 * what Orvius can claim a hand in. Synthetic events are counted only when asked.
 */
export async function workflowReport(businessId: string, since: Date, options: { synthetic?: boolean } = {}): Promise<WorkflowReport> {
  const synthetic = options.synthetic ?? false;
  const events = await prisma.auditEvent.findMany({
    where: { businessId, action: { startsWith: "workflow." }, createdAt: { gte: since } },
    select: { action: true, entityId: true, leadId: true, jobId: true, detailJson: true, createdAt: true },
  });
  const read = (raw: string | null) => {
    try {
      return JSON.parse(raw ?? "{}") as { synthetic?: boolean; stage?: string; at?: string | null };
    } catch {
      return {};
    }
  };
  const mine = events.filter((e) => Boolean(read(e.detailJson).synthetic) === synthetic);
  const completed = mine.filter((e) => e.action === "workflow.stage_done" && read(e.detailJson).stage === "completion");
  const jobIds = [...new Set(completed.map((e) => e.jobId).filter((id): id is string => Boolean(id)))];
  const [jobs, payments] = await Promise.all([
    jobIds.length
      ? prisma.job.findMany({ where: { businessId, id: { in: jobIds } }, select: { id: true, leadId: true, lead: { select: { callId: true } } } })
      : [],
    jobIds.length ? prisma.payment.findMany({ where: { businessId, invoice: { jobId: { in: jobIds } } }, select: { amountCents: true, status: true, method: true } }) : [],
  ]);
  const commandBooked = new Set(mine.filter((e) => e.action === "workflow.started").map((e) => e.leadId).filter(Boolean));
  const startAt = new Map<string, number>();
  for (const e of mine) {
    if (e.action === "workflow.started" && e.leadId) startAt.set(e.leadId, e.createdAt.getTime());
  }
  const durations: number[] = [];
  for (const e of completed) {
    const job = jobs.find((j) => j.id === e.jobId);
    const start = job?.leadId ? startAt.get(job.leadId) : undefined;
    const end = Date.parse(read(e.detailJson).at ?? "") || e.createdAt.getTime();
    if (start != null && end >= start) durations.push(end - start);
  }
  return {
    synthetic,
    started: mine.filter((e) => e.action === "workflow.started").length,
    completedJobs: jobIds.length,
    collectedCents: collectedCents(payments),
    attributableJobs: jobs.filter((j) => j.lead?.callId || (j.leadId && commandBooked.has(j.leadId))).length,
    ownerDecisions: mine.filter((e) => e.action === "workflow.decision").length,
    exceptions: mine.filter((e) => e.action === "workflow.exception").length,
    recovered: mine.filter((e) => e.action === "workflow.recovered").length,
    startToCompleteMs: durations,
  };
}
