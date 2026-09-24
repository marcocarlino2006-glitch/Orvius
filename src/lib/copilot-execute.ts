import { recordAudit, type AuditInput } from "@/lib/audit";
import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { sendCustomerSms } from "@/lib/customer-sms";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { prisma } from "@/lib/prisma";
import { loadTechCandidates } from "@/lib/technician-match";

export type ProposalParams = { jobId?: string; leadId?: string; technicianId?: string };

type RunOutcome =
  | { error: string; status: number; reason?: string }
  | {
      result: Record<string, unknown>;
      summary: string;
      entity: { type: AuditInput["entityType"]; id: string };
      links: { jobId?: string; leadId?: string; customerId?: string | null };
    };

function overlaps(aStart: Date, aMin: number, bStart: Date, bMin: number) {
  return aStart.getTime() < bStart.getTime() + bMin * 60_000 && bStart.getTime() < aStart.getTime() + aMin * 60_000;
}

/** Re-checks every precondition at approval time — the world may have moved since the preview. */
async function runProposal(
  business: { id: string; name: string },
  action: string,
  params: ProposalParams,
): Promise<RunOutcome> {
  if (action === "assign_tech") {
    if (!params.jobId || !params.technicianId) return { error: "Invalid assign params", status: 400 };
    const job = await prisma.job.findFirst({ where: { id: params.jobId, businessId: business.id } });
    if (!job) return { error: "Job not found", status: 404 };
    if (job.status === "completed" || job.status === "cancelled") {
      return { error: `This job is already ${job.status}.`, status: 409, reason: "job_closed" };
    }
    const tech = await prisma.technician.findFirst({
      where: { id: params.technicianId, businessId: business.id, isActive: true },
    });
    if (!tech) return { error: "Technician not found or inactive", status: 404 };
    if (job.technicianId === tech.id) {
      return { error: `${tech.name} is already on this job.`, status: 409, reason: "already_assigned" };
    }
    if (job.scheduledAt) {
      const calendar = (await loadTechCandidates(business.id, job.id)).find((c) => c.id === tech.id);
      const duration = job.durationMin ?? DEFAULT_JOB_DURATION_MIN;
      const clash = calendar?.jobs.find((j) => overlaps(job.scheduledAt!, duration, j.scheduledAt, j.durationMin));
      if (clash) {
        return {
          error: `${tech.name} now has another job at that time. Pick someone else or move the appointment.`,
          status: 409,
          reason: "technician_busy",
        };
      }
    }
    await prisma.job.update({ where: { id: job.id }, data: { technicianId: tech.id } });
    const sms = await notifyTechOnAssign({
      jobId: job.id,
      previousTechnicianId: job.technicianId,
      nextTechnicianId: tech.id,
    });
    return {
      result: { jobId: job.id, technicianId: tech.id, techSms: sms },
      summary: `Assigned ${tech.name} to ${job.title}${tech.phone ? " and texted them the details" : ""}.`,
      entity: { type: "job", id: job.id },
      links: { jobId: job.id, leadId: job.leadId ?? undefined, customerId: job.customerId },
    };
  }

  if (action === "mark_contacted" || action === "sms_followup") {
    if (!params.leadId) return { error: "Invalid lead params", status: 400 };
    const lead = await prisma.lead.findFirst({ where: { id: params.leadId, businessId: business.id } });
    if (!lead) return { error: "Lead not found", status: 404 };
    const who = lead.name ?? lead.phone ?? "the caller";

    let smsSid: string | undefined;
    if (action === "sms_followup") {
      if (!lead.phone) return { error: "Lead has no phone", status: 400 };
      const sms = await sendCustomerSms({
        businessId: business.id,
        to: lead.phone,
        body: `Hi${lead.name ? ` ${lead.name}` : ""} — this is ${business.name}. We received your service request and will follow up shortly. Reply STOP to opt out.`,
      });
      if (!sms.sent) {
        const optedOut = sms.reason === "customer_opted_out";
        return {
          error: optedOut ? "Customer opted out of SMS" : "SMS unavailable",
          reason: sms.reason,
          status: optedOut ? 409 : 503,
        };
      }
      smsSid = sms.sid;
    }
    if (lead.status === "new") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "contacted", firstContactedAt: lead.firstContactedAt ?? new Date() },
      });
    }
    return {
      result: { leadId: lead.id, status: "contacted", ...(smsSid ? { smsSid } : {}) },
      summary: action === "sms_followup" ? `Texted ${who} a follow-up and marked them contacted.` : `Marked ${who} as contacted.`,
      entity: { type: "lead", id: lead.id },
      links: { leadId: lead.id, customerId: lead.customerId },
    };
  }

  return { error: "Unknown action", status: 400 };
}

export type ExecuteOutcome =
  | { ok: false; error: string; status: number; reason?: string }
  | {
      ok: true;
      proposalId: string;
      result: Record<string, unknown>;
      confirmation: { summary: string; auditId: string | null; at: string };
    };

/**
 * Run one approved proposal exactly once. The proposal is claimed before
 * anything changes, so a double click or a retried request cannot run it
 * twice; a refusal releases the claim so the owner can fix the cause and
 * approve again.
 */
export async function executeProposal(params: {
  business: { id: string; name: string };
  proposalId: string;
}): Promise<ExecuteOutcome> {
  const { business } = params;
  const claimed = await prisma.copilotAction.updateMany({
    where: { id: params.proposalId, businessId: business.id, status: "proposed" },
    data: { status: "executing" },
  });
  if (claimed.count === 0) {
    return { ok: false, error: "Proposal not found or already used", status: 404 };
  }
  const proposal = await prisma.copilotAction.findUniqueOrThrow({ where: { id: params.proposalId } });

  let outcome: RunOutcome;
  try {
    outcome = await runProposal(business, proposal.action, JSON.parse(proposal.paramsJson) as ProposalParams);
  } catch (error) {
    await prisma.copilotAction.update({ where: { id: proposal.id }, data: { status: "proposed" } });
    throw error;
  }
  if ("error" in outcome) {
    await prisma.copilotAction.update({ where: { id: proposal.id }, data: { status: "proposed" } });
    return { ok: false, error: outcome.error, status: outcome.status, reason: outcome.reason };
  }

  const executedAt = new Date();
  await prisma.copilotAction.update({
    where: { id: proposal.id },
    data: { status: "executed", executedAt, resultJson: JSON.stringify(outcome.result) },
  });
  const auditId = await recordAudit({
    businessId: business.id,
    entityType: outcome.entity.type,
    entityId: outcome.entity.id,
    action: "copilot.executed",
    actor: "owner",
    summary: outcome.summary,
    detail: { proposalId: proposal.id, action: proposal.action, preview: proposal.preview, ...outcome.result },
    jobId: outcome.links.jobId ?? null,
    leadId: outcome.links.leadId ?? null,
    customerId: outcome.links.customerId ?? null,
    idempotencyKey: `copilot:${proposal.id}:executed`,
  });

  return {
    ok: true,
    proposalId: proposal.id,
    result: outcome.result,
    confirmation: { summary: outcome.summary, auditId, at: executedAt.toISOString() },
  };
}
