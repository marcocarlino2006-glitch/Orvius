import { recordAudit, type AuditActor } from "@/lib/audit";
import { recordSetupMilestone } from "@/lib/workflow-events";
import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { JobTransitionError, ownerScheduleClash, updateJobStatus } from "@/lib/job";
import { lineTotalCents } from "@/lib/job-field";
import { isJobOutcomeCode, parseFinalAmountCents, type JobOutcomeCode } from "@/lib/job-outcome";
import { jobStatusLabel, jobTransitionProblem, type JobStatus } from "@/lib/job-status";
import { prisma } from "@/lib/prisma";
import { authorizeScheduleOverride, getSchedulingPolicy, scheduleOverrideRecord } from "@/lib/scheduling-policy";
import { classifyRequest } from "@/lib/trade-playbooks";

/*
  The one way a job's status changes. Statuses stay the six in job-status.ts;
  reschedule, cancel, reopen and correction are audited actions, not states.
  A physical job is done when someone marks it done from on site with what
  happened and a price or no-charge. The two exceptions are explicit: remote
  work the owner has switched on, and an owner or manager correction with a
  reason and where they heard it. Orvius itself never marks a job done.
*/

export const JOB_TRANSITION_POLICY_VERSION = "job-transition-1";

export type TransitionActor = {
  kind: "owner" | "manager" | "dispatcher" | "technician" | "ai" | "system";
  email?: string | null;
};

export type CompletionEvidence = {
  path?: "field" | "remote" | "correction";
  resolutionCode?: unknown;
  resolutionSummary?: string | null;
  finalAmountCents?: unknown;
  noCharge?: boolean;
  /** For a correction: how the person knows it was done. */
  evidenceSource?: unknown;
};

export const CORRECTION_SOURCES = ["customer_confirmed", "technician_report", "paper_ticket", "external_system", "owner_report"] as const;

/** Work that can be finished without a visit. Installs, parts and maintenance need someone there. */
export const REMOTE_OUTCOMES: readonly JobOutcomeCode[] = ["repaired", "diagnostic_only", "no_fault_found", "referred", "customer_declined", "return_visit"];

const OFFICE: TransitionActor["kind"][] = ["owner", "manager"];
const PEOPLE: TransitionActor["kind"][] = ["owner", "manager", "dispatcher", "technician"];

export type CompletionPlan = {
  path: "field" | "remote" | "correction";
  resolutionCode: JobOutcomeCode;
  resolutionSummary: string | null;
  finalAmountCents: number | null;
  noCharge: boolean;
  evidenceSource: string | null;
};

/** Why this completion can't be recorded, or the plan for recording it. */
export function completionDecision(params: {
  from: string;
  actor: TransitionActor;
  evidence: CompletionEvidence | null | undefined;
  remoteCompletionAllowed: boolean;
  hasLineItems: boolean;
  reason?: string | null;
}): { ok: true; plan: CompletionPlan } | { ok: false; error: string; status: 403 | 409 | 422 } {
  const { actor, from } = params;
  if (!PEOPLE.includes(actor.kind)) {
    return { ok: false, status: 403, error: "Orvius can't mark a job done. The technician or the office does, with what happened." };
  }
  if (from === "cancelled") return { ok: false, status: 409, error: "This job was cancelled. Reopen it before marking it done." };
  const e = params.evidence ?? {};
  const path = e.path ?? "field";
  if (!isJobOutcomeCode(e.resolutionCode)) return { ok: false, status: 422, error: "Choose what happened before marking it done." };
  const finalAmountCents = parseFinalAmountCents(e.finalAmountCents);
  if (e.finalAmountCents != null && e.finalAmountCents !== "" && finalAmountCents == null) {
    return { ok: false, status: 422, error: "Final amount must be between $0 and $50,000." };
  }
  const noCharge = e.noCharge === true;
  if (finalAmountCents == null && !noCharge && !params.hasLineItems) {
    return { ok: false, status: 422, error: "Enter what it cost, or mark it no charge." };
  }
  const base = {
    resolutionCode: e.resolutionCode,
    resolutionSummary: e.resolutionSummary?.trim().slice(0, 500) || null,
    finalAmountCents,
    noCharge,
  };
  if (path === "field") {
    if (from !== "on_site") {
      return {
        ok: false,
        status: 409,
        error: "Mark the technician on site first. If it was finished another way, record a correction with how you know.",
      };
    }
    return { ok: true, plan: { ...base, path, evidenceSource: null } };
  }
  if (path === "remote") {
    if (!params.remoteCompletionAllowed) return { ok: false, status: 409, error: "Remote completion isn't switched on for this shop." };
    if (!REMOTE_OUTCOMES.includes(e.resolutionCode)) {
      return { ok: false, status: 422, error: "That kind of work needs someone on site; it can't be finished remotely." };
    }
    return { ok: true, plan: { ...base, path, evidenceSource: "remote_service" } };
  }
  if (!OFFICE.includes(actor.kind)) return { ok: false, status: 403, error: "Only the owner or a manager can record a correction." };
  if (!params.reason?.trim()) return { ok: false, status: 422, error: "Say why you're correcting it, so the history shows it." };
  if (typeof e.evidenceSource !== "string" || !(CORRECTION_SOURCES as readonly string[]).includes(e.evidenceSource)) {
    return { ok: false, status: 422, error: "Say how you know it was done." };
  }
  return { ok: true, plan: { ...base, path: "correction", evidenceSource: e.evidenceSource } };
}

type BillLine = { kind: string; quantity: number; unitCents: number };

/**
 * What the completed job is worth.
 * No-charge is $0 even when the job has lines. Otherwise the lines are the
 * bill; a typed total is used only when there are no lines.
 */
export function completionAmountCents(params: {
  noCharge: boolean;
  typedCents: number | null;
  lines: BillLine[];
}): number {
  if (params.noCharge) return 0;
  if (params.lines.length) return params.lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  return params.typedCents ?? 0;
}

function auditActor(actor: TransitionActor): { actor: AuditActor; actorEmail?: string } {
  if (actor.kind === "ai" || actor.kind === "system") return { actor: "system" };
  if (actor.kind === "technician") return { actor: "technician" };
  return { actor: actor.kind === "owner" ? "owner" : "teammate", ...(actor.email ? { actorEmail: actor.email } : {}) };
}

export type TransitionResult = { changed: boolean; from: string; to: JobStatus };

/**
 * Move a job to `to`. Completion, reopen and cancel follow the rules above;
 * the plain field steps (confirmed, on the way, on site) keep their existing
 * behaviour, including the single "on the way" text.
 */
export async function transitionJob(params: {
  businessId: string;
  jobId: string;
  to: JobStatus;
  actor: TransitionActor;
  via: "dashboard" | "owner_sms" | "tech_app" | "tech_link" | "system";
  completion?: CompletionEvidence | null;
  reason?: string | null;
  /** When it happened in the field; a late "on the way" is recorded without texting. */
  at?: Date;
  notifyCustomer?: boolean;
  /** Reopening into a slot that now clashes: the person saw the clash and chose it. */
  allowClash?: boolean;
}): Promise<TransitionResult> {
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, businessId: params.businessId },
    select: {
      id: true,
      status: true,
      leadId: true,
      customerId: true,
      scheduledAt: true,
      durationMin: true,
      technicianId: true,
      serviceType: true,
      notes: true,
      completedAt: true,
      resolutionCode: true,
      resolutionSummary: true,
      finalAmountCents: true,
      outcomeCapturedAt: true,
    },
  });
  if (!job) throw new JobTransitionError("Job not found", 404);
  const from = job.status;
  if (from === params.to) return { changed: false, from, to: params.to };
  const reason = params.reason?.trim().slice(0, 300) || null;
  const auditBase = {
    businessId: params.businessId,
    entityType: "job" as const,
    entityId: job.id,
    jobId: job.id,
    leadId: job.leadId,
    customerId: job.customerId,
    ...auditActor(params.actor),
  };
  const because = reason ? ` Reason: ${reason}` : "";

  if (params.to === "completed") {
    const [policy, lineRows] = await Promise.all([
      getSchedulingPolicy(params.businessId),
      prisma.jobLineItem.findMany({
        where: { jobId: job.id },
        select: { kind: true, quantity: true, unitCents: true },
      }),
    ]);
    const decision = completionDecision({
      from,
      actor: params.actor,
      evidence: params.completion,
      remoteCompletionAllowed: policy.remoteCompletionAllowed,
      hasLineItems: lineRows.length > 0,
      reason,
    });
    if (!decision.ok) throw new JobTransitionError(decision.error, decision.status);
    const plan = decision.plan;
    const amountCents = completionAmountCents({
      noCharge: plan.noCharge,
      typedCents: plan.finalAmountCents,
      lines: lineRows,
    });
    const now = params.at ?? new Date();
    const moved = await prisma.job.updateMany({
      where: { id: job.id, status: from },
      data: {
        status: "completed",
        completedAt: now,
        resolutionCode: plan.resolutionCode,
        resolutionSummary: plan.resolutionSummary,
        finalAmountCents: amountCents,
        outcomeCapturedAt: now,
      },
    });
    if (!moved.count) throw new JobTransitionError("Someone else changed this job just now. Refresh and try again.", 409);
    await recordAudit({
      ...auditBase,
      action: plan.path === "correction" ? "job.completion_corrected" : "job.status_changed",
      summary:
        plan.path === "correction"
          ? `Recorded as done by correction (${plan.evidenceSource?.replace(/_/g, " ")}).${because}`
          : `Moved the job from ${jobStatusLabel(from)} to done${plan.path === "remote" ? " (remote work)" : ""}.`,
      detail: {
        policyVersion: JOB_TRANSITION_POLICY_VERSION,
        from,
        to: "completed",
        path: plan.path,
        evidenceSource: plan.evidenceSource,
        resolutionCode: plan.resolutionCode,
        disposition: plan.noCharge ? "no_charge" : lineRows.length > 0 ? "line_items" : "priced",
        finalAmountCents: amountCents,
        reason,
        via: params.via,
      },
    });
    /* The job is already done; a milestone that can't be written never undoes that. */
    if (job.leadId) await recordSetupMilestone(params.businessId, "first_outcome", now, { jobId: job.id, via: params.via }).catch(() => undefined);
    return { changed: true, from, to: "completed" };
  }

  if (params.to === "cancelled") {
    const paidInvoice = (await prisma.invoice.count({ where: { jobId: job.id, status: { in: ["paid", "partial"] } } })) > 0;
    const problem = jobTransitionProblem(from, "cancelled", { paidInvoice });
    if (problem) throw new JobTransitionError(problem);
  }

  if (from === "completed" || from === "cancelled") {
    if (!OFFICE.includes(params.actor.kind)) {
      throw new JobTransitionError("Only the owner or a manager can reopen a finished or cancelled job.", 403);
    }
    if (!reason) throw new JobTransitionError("Say why you're reopening it, so the history shows it.", 422);
    let overrideRecord: Awaited<ReturnType<typeof scheduleOverrideRecord>> | null = null;
    if (job.scheduledAt && job.scheduledAt.getTime() > Date.now() && params.to !== "cancelled") {
      const shop = await prisma.business.findUniqueOrThrow({
        where: { id: params.businessId },
        select: { timezone: true, trade: true, servicesJson: true, jobLengthsJson: true, name: true },
      });
      const durationMin = job.durationMin ?? DEFAULT_JOB_DURATION_MIN;
      const clash = await ownerScheduleClash({
        businessId: params.businessId,
        at: job.scheduledAt,
        durationMin,
        skill: classifyRequest({ business: shop, serviceType: job.serviceType, notes: job.notes, urgency: null }).service.skill,
        timezone: shop.timezone ?? "America/New_York",
        technicianId: job.technicianId,
        excludeJobId: job.id,
      });
      if (clash && !params.allowClash) throw new JobTransitionError(`${clash} Move it or reopen it anyway.`, 409);
      if (clash) {
        const authority = await authorizeScheduleOverride({
          businessId: params.businessId,
          actor: { role: params.actor.kind, email: params.actor.email },
          reason,
        });
        if (!authority.ok) throw new JobTransitionError(authority.error, authority.status);
        overrideRecord = await scheduleOverrideRecord({
          businessId: params.businessId,
          clash,
          before: { at: job.scheduledAt, technicianId: job.technicianId },
          after: { at: job.scheduledAt, technicianId: job.technicianId },
          durationMin,
          excludeJobId: job.id,
          actor: { role: params.actor.kind, email: params.actor.email },
          authority,
          via: params.via === "owner_sms" ? "owner_sms" : "dashboard",
          notify: { customer: "none", technician: "none" },
        });
      }
    }
    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({ where: { jobId: job.id }, select: { id: true, status: true, amountCents: true, paidAt: true } }),
      prisma.payment.findMany({ where: { invoice: { jobId: job.id } }, select: { id: true, invoiceId: true, status: true, amountCents: true } }),
    ]);
    const moved = await prisma.job.updateMany({
      where: { id: job.id, status: from },
      data: { status: params.to },
    });
    if (!moved.count) throw new JobTransitionError("Someone else changed this job just now. Refresh and try again.", 409);
    await recordAudit({
      ...auditBase,
      action: "job.reopened",
      summary: `Reopened the job from ${jobStatusLabel(from)} to ${jobStatusLabel(params.to)}.${because}`,
      detail: {
        policyVersion: JOB_TRANSITION_POLICY_VERSION,
        from,
        to: params.to,
        reason,
        via: params.via,
        priorCompletion:
          from === "completed"
            ? {
                completedAt: job.completedAt?.toISOString() ?? null,
                resolutionCode: job.resolutionCode,
                resolutionSummary: job.resolutionSummary,
                finalAmountCents: job.finalAmountCents,
                outcomeCapturedAt: job.outcomeCapturedAt?.toISOString() ?? null,
              }
            : null,
        moneyKept: {
          invoices: invoices.map((i) => ({ id: i.id, status: i.status, amountCents: i.amountCents, paidAt: i.paidAt?.toISOString() ?? null })),
          payments: payments.map((p) => ({ id: p.id, invoiceId: p.invoiceId, status: p.status, amountCents: p.amountCents })),
        },
        scheduleOverride: overrideRecord,
      },
    });
    if (overrideRecord) {
      await recordAudit({ ...auditBase, action: "job.schedule_override", summary: `Reopened over a clash: ${overrideRecord.clash}${because}`, detail: overrideRecord });
    }
    return { changed: true, from, to: params.to };
  }

  if (params.to === "cancelled" && (!PEOPLE.includes(params.actor.kind) || params.actor.kind === "technician")) {
    throw new JobTransitionError("Only the office can cancel a job.", 403);
  }

  await updateJobStatus(job.id, params.to, { at: params.at, notifyCustomer: params.notifyCustomer });
  await recordAudit({
    ...auditBase,
    action: "job.status_changed",
    summary: `Moved the job from ${jobStatusLabel(from)} to ${jobStatusLabel(params.to)}.${because}`,
    detail: { policyVersion: JOB_TRANSITION_POLICY_VERSION, from, to: params.to, reason, via: params.via },
  });
  return { changed: true, from, to: params.to };
}
