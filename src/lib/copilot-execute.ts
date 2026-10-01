import type { Business } from "@prisma/client";
import { personActor, recordAudit, type AuditInput } from "@/lib/audit";
import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { isWindowOpen, openWindows, windowLabel } from "@/lib/copilot-propose";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { sendCustomerSms } from "@/lib/customer-sms";
import { createJobFromLead, SlotTakenError } from "@/lib/job";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { prisma } from "@/lib/prisma";
import { loadTechCandidates } from "@/lib/technician-match";
import { sendSms } from "@/lib/twilio-sms";

export type ProposalParams = { jobId?: string; leadId?: string; technicianId?: string; at?: string };

type Shop = Pick<Business, "id" | "name" | "timezone" | "hoursJson" | "servicesJson" | "trade">;

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
      const calendar = (await loadTechCandidates(business.id, job.id, job.scheduledAt)).find((c) => c.id === tech.id);
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
      summary: `Assigned ${tech.name} to ${job.title}${
        sms.sent
          ? " and texted them the details"
          : tech.phone
            ? ` — the text to ${tech.name} did not send, so tell them directly`
            : ` — ${tech.name} has no phone on file, so tell them directly`
      }.`,
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
          error: optedOut
            ? "This customer opted out of texts."
            : "Texting is not connected for this workspace yet.",
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

  if (action === "book_window" || action === "reschedule") {
    return runWindowProposal(business, action, params);
  }

  return { error: "Unknown action", status: 400 };
}

async function staleWindow(
  shop: Shop,
  target: Parameters<typeof openWindows>[1],
  at: Date,
): Promise<RunOutcome> {
  const next = await openWindows(shop, target, 3);
  return {
    error: `${windowLabel(at, shop.timezone)} is no longer open — the schedule changed since this was proposed.${
      next.length ? ` Open now: ${next.map((d) => windowLabel(d, shop.timezone)).join("; ")}.` : " Nothing is open in the next two weeks."
    } Nothing was changed.`,
    status: 409,
    reason: "stale_window",
  };
}

async function runWindowProposal(
  business: { id: string; name: string },
  action: "book_window" | "reschedule",
  params: ProposalParams,
): Promise<RunOutcome> {
  const at = params.at ? new Date(params.at) : null;
  if (!at || Number.isNaN(at.getTime())) return { error: "Invalid window", status: 400 };
  const shop = await prisma.business.findUniqueOrThrow({
    where: { id: business.id },
    select: { id: true, name: true, timezone: true, hoursJson: true, servicesJson: true, trade: true },
  });
  const when = windowLabel(at, shop.timezone);

  if (action === "book_window") {
    if (!params.leadId) return { error: "Invalid booking params", status: 400 };
    const lead = await prisma.lead.findFirst({
      where: { id: params.leadId, businessId: business.id },
      include: { job: { select: { id: true } } },
    });
    if (!lead) return { error: "Request not found", status: 404 };
    if (lead.job) return { error: "This request was booked since the proposal.", status: 409, reason: "already_booked" };
    if (lead.status === "spam" || lead.status === "lost") {
      return { error: `This request was closed as ${lead.status}.`, status: 409, reason: "lead_closed" };
    }
    const target = { kind: "lead" as const, lead };
    if (!(await isWindowOpen(shop, target, at))) return staleWindow(shop, target, at);
    let job;
    try {
      job = await createJobFromLead({ leadId: lead.id, scheduledAt: at, actor: "owner", enforceCapacity: true });
    } catch (error) {
      if (error instanceof SlotTakenError) return staleWindow(shop, target, at);
      throw error;
    }
    const booked = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: { technician: { select: { name: true } } },
    });
    const who = lead.name ?? lead.phone ?? "the caller";
    return {
      result: { jobId: job.id, leadId: lead.id, scheduledAt: at.toISOString(), technician: booked.technician?.name ?? null },
      summary: `Booked ${who} for ${when} as a proposed window${
        booked.technician ? ` with ${booked.technician.name}` : " — no technician was free to assign, so pick one"
      }. ${lead.phone ? "The confirmation text is on its way; the trace shows when it lands." : "No phone on file — call to confirm."}`,
      entity: { type: "job", id: job.id },
      links: { jobId: job.id, leadId: lead.id, customerId: job.customerId },
    };
  }

  if (!params.jobId) return { error: "Invalid reschedule params", status: 400 };
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, businessId: business.id },
    include: { technician: true, customer: { select: { name: true } }, lead: { select: { name: true } } },
  });
  if (!job) return { error: "Job not found", status: 404 };
  if (job.status === "completed" || job.status === "cancelled") {
    return { error: `This job is already ${job.status}.`, status: 409, reason: "job_closed" };
  }
  if (job.status === "en_route" || job.status === "on_site") {
    return { error: "The technician is already on the way or on site — call them before moving it.", status: 409, reason: "job_in_progress" };
  }
  const target = { kind: "job" as const, job };
  if (!(await isWindowOpen(shop, target, at))) return staleWindow(shop, target, at);
  const duration = job.durationMin ?? DEFAULT_JOB_DURATION_MIN;
  if (job.technician) {
    const calendar = (await loadTechCandidates(business.id, job.id, at)).find((c) => c.id === job.technicianId);
    const clash = calendar?.jobs.find((j) => overlaps(at, duration, j.scheduledAt, j.durationMin));
    if (clash) {
      return {
        error: `${job.technician.name} has another job at ${when}. Reassign or pick another time — nothing was changed.`,
        status: 409,
        reason: "technician_busy",
      };
    }
  }
  const from = job.scheduledAt;
  await prisma.job.update({
    where: { id: job.id },
    data: {
      scheduledAt: at,
      status: job.status === "confirmed" ? "scheduled" : job.status,
      customerConfirmedAt: null,
      customerConfirmSentAt: null,
      customerConfirmFailedAt: null,
      customerConfirmReminderSentAt: null,
    },
  });
  await recordAudit({
    businessId: business.id,
    entityType: "job",
    entityId: job.id,
    action: "job.rescheduled",
    actor: "owner",
    summary: `Moved the appointment to ${when}${from ? ` (was ${windowLabel(from, shop.timezone)})` : ""}.`,
    detail: { from: from?.toISOString() ?? null, to: at.toISOString() },
    jobId: job.id,
    leadId: job.leadId,
    customerId: job.customerId,
  });
  const confirm = await sendCustomerConfirmSms(job.id);
  await recordAudit({
    businessId: business.id,
    entityType: "job",
    entityId: job.id,
    action: confirm.sent ? "customer.confirmation_sent" : "customer.confirmation_skipped",
    summary: confirm.sent
      ? "Texted the customer the new window to confirm"
      : `Customer confirmation not sent (${(confirm.reason ?? "unknown").replace(/_/g, " ")})`,
    detail: { reason: confirm.reason ?? null, reschedule: true },
    jobId: job.id,
    leadId: job.leadId,
    customerId: job.customerId,
  });
  let techSent = false;
  if (job.technician?.phone) {
    techSent = Boolean(
      await sendSms({
        to: job.technician.phone,
        body: `${business.name}: ${job.title} moved to ${when}.${job.address ? ` ${job.address}.` : ""}`,
        businessId: business.id,
        audience: "tech",
      }).catch(() => null),
    );
  }
  const who = job.customer?.name ?? job.lead?.name ?? "the customer";
  return {
    result: { jobId: job.id, from: from?.toISOString() ?? null, to: at.toISOString(), customerText: confirm, techText: techSent },
    summary: `Moved ${job.title} to ${when}. ${
      confirm.sent ? `Texted ${who} the new window to confirm` : `The text to ${who} did not send (${(confirm.reason ?? "unknown").replace(/_/g, " ")}) — call them`
    }${job.technician ? (techSent ? ` and told ${job.technician.name}` : `; tell ${job.technician.name} directly`) : ""}.`,
    entity: { type: "job", id: job.id },
    links: { jobId: job.id, leadId: job.leadId ?? undefined, customerId: job.customerId },
  };
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
  by?: { role: string; email: string };
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
    ...(params.by ? personActor(params.by) : { actor: "owner" as const }),
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
