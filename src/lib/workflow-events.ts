import { recordAudit } from "@/lib/audit";
import { isDemoBusiness } from "@/lib/demo-business";
import { isFounderEmail } from "@/lib/founder";
import { moneyTotals, type MoneyTotals } from "@/lib/payment-math";
import { isSetupSandbox } from "@/lib/setup-flow";
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

export type WorkflowDecision = "approved_plan" | "recorded_completion" | "chose_assignment" | "resolved_exception" | "sent_bill";

function key(outcome: Outcome) {
  return outcome.jobId ?? outcome.leadId ?? "none";
}

/** Stage completions, new exceptions, and exceptions that cleared, for one outcome. Idempotent. */
export async function recordWorkflowProgress(outcome: Outcome, by: { actor: "owner" | "teammate" | "technician" | "system"; email?: string | null }) {
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

export type SetupMilestone = "line_proven" | "first_outcome";

/** A setup step proven by something that happened (a real call, a job marked done), once per shop. */
export async function recordSetupMilestone(businessId: string, milestone: SetupMilestone, at: Date, detail: Record<string, unknown> = {}) {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { environment: true, slug: true, name: true, ownerEmail: true } });
  if (!shop) return;
  await recordAudit({
    businessId,
    entityType: "shop",
    entityId: businessId,
    action: "workflow.setup_milestone",
    actor: "system",
    actorEmail: null,
    summary: milestone === "line_proven" ? "First real call answered on the Orvius line" : "First job done start to finish, marked by a person",
    detail: { milestone, at: at.toISOString(), synthetic: shopIsSynthetic(shop), ...detail },
    idempotencyKey: `workflow:${businessId}:setup:${milestone}`,
  });
}

/** Demo, test-mode and the founder's own shops: their work is synthetic whatever an event says. */
export function shopIsSynthetic(shop: { environment?: string | null; slug: string; name?: string; ownerEmail?: string | null; setupJson?: string | null }): boolean {
  return shop.environment !== "production" || isDemoBusiness(shop) || isSetupSandbox(shop) || isFounderEmail(shop.ownerEmail);
}

/** What these numbers can't say. Missing inputs stay unknown; nothing is estimated in their place. */
export const WORKFLOW_UNKNOWNS = [
  "Owner hours saved: Orvius doesn't record how long these tasks took before.",
  "Profit: labor and material costs aren't entered, so only money collected is shown.",
  "Whether a job would have happened without Orvius: attributable means Orvius answered the call or the booking was approved in Command, not that it caused the sale.",
  "Retention: customers aren't followed long enough here to say.",
] as const;

export type WorkflowReport = {
  synthetic: boolean;
  /** The whole shop is demo, test-mode or the founder's own, so nothing in it counts as real work. */
  shopSynthetic: boolean;
  started: number;
  /** Jobs a person marked done in the window, with what happened, and still done now. */
  completedJobs: number;
  /** Receipts on those jobs, as collected; claims and estimates are not counted. Same as money.grossCents. */
  collectedCents: number;
  money: MoneyTotals;
  /** Of those jobs, the ones from a real phone call Orvius answered or a booking approved in Command. */
  attributableJobs: number;
  ownerDecisions: number;
  exceptions: number;
  recovered: number;
  /** From the record times on the events: start to completion, per job, in ms. */
  startToCompleteMs: number[];
  setupMilestones: SetupMilestone[];
  /** Events of the other kind (synthetic when real was asked for, and the reverse) left out of these numbers. */
  excluded: number;
  unknown: readonly string[];
};

/**
 * One shop's numbers for a window, kept apart: jobs finished, money in, and
 * what Orvius can claim a hand in. Synthetic events are counted only when asked.
 */
export async function workflowReport(businessId: string, since: Date, options: { synthetic?: boolean; until?: Date } = {}): Promise<WorkflowReport> {
  const synthetic = options.synthetic ?? false;
  const window = { gte: since, ...(options.until ? { lt: options.until } : {}) };
  const [shop, events] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { environment: true, slug: true, name: true, ownerEmail: true, setupJson: true } }),
    prisma.auditEvent.findMany({
      where: { businessId, action: { startsWith: "workflow." }, createdAt: window },
      select: { action: true, entityId: true, leadId: true, jobId: true, detailJson: true, createdAt: true },
    }),
  ]);
  const shopSynthetic = !shop || shopIsSynthetic(shop);
  const read = (raw: string | null) => {
    try {
      return JSON.parse(raw ?? "{}") as { synthetic?: boolean; stage?: string; at?: string | null; milestone?: SetupMilestone };
    } catch {
      return {};
    }
  };
  const isSynthetic = (raw: string | null) => shopSynthetic || Boolean(read(raw).synthetic);
  const mine = events.filter((e) => isSynthetic(e.detailJson) === synthetic);
  const completed = mine.filter((e) => e.action === "workflow.stage_done" && read(e.detailJson).stage === "completion");
  const named = [...new Set(completed.map((e) => e.jobId).filter((id): id is string => Boolean(id)))];
  /* An event is a pointer; the job record decides. Reopened, cancelled or never-resolved work doesn't count. */
  const jobs = named.length
    ? await prisma.job.findMany({
        where: { businessId, id: { in: named }, status: "completed", resolutionCode: { not: null }, completedAt: window },
        select: { id: true, leadId: true, lead: { select: { callId: true, call: { select: { channel: true, businessId: true } } } } },
      })
    : [];
  const jobIds = jobs.map((j) => j.id);
  const payments = jobIds.length
    ? await prisma.payment.findMany({ where: { businessId, invoice: { jobId: { in: jobIds } } }, select: { amountCents: true, status: true, refundedCents: true } })
    : [];
  const money = moneyTotals(payments);
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
  const realCall = (j: (typeof jobs)[number]) => Boolean(j.lead?.callId && j.lead.call && j.lead.call.businessId === businessId && j.lead.call.channel !== "web_demo");
  return {
    synthetic,
    shopSynthetic,
    started: mine.filter((e) => e.action === "workflow.started").length,
    completedJobs: jobIds.length,
    collectedCents: money.grossCents,
    money,
    attributableJobs: jobs.filter((j) => realCall(j) || (j.leadId && commandBooked.has(j.leadId))).length,
    ownerDecisions: mine.filter((e) => e.action === "workflow.decision").length,
    exceptions: mine.filter((e) => e.action === "workflow.exception").length,
    recovered: mine.filter((e) => e.action === "workflow.recovered").length,
    startToCompleteMs: durations,
    setupMilestones: [...new Set(mine.filter((e) => e.action === "workflow.setup_milestone").map((e) => read(e.detailJson).milestone).filter((m): m is SetupMilestone => Boolean(m)))],
    excluded: events.length - mine.length,
    unknown: WORKFLOW_UNKNOWNS,
  };
}
