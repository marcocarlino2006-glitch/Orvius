import { COMMAND_POLICY_VERSION, decideApproval, grantsForActor } from "@/lib/command-authority";
import type { Business } from "@prisma/client";
import { personActor, recordAudit, type AuditInput } from "@/lib/audit";
import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { isWindowOpen, openTwin, openWindows, PROPOSAL_FRESH_MS, refuseTwin, windowLabel } from "@/lib/copilot-propose";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { sendCustomerSms } from "@/lib/customer-sms";
import { createJobFromLead, SlotTakenError } from "@/lib/job";
import { notifyTechOnAssign, notifyTechOnReschedule } from "@/lib/notify-tech-assign";
import { prisma } from "@/lib/prisma";
import { loadTechCandidates } from "@/lib/technician-match";
import { textingHeld } from "@/lib/twilio-sms";

export type ProposalParams = { jobId?: string; leadId?: string; technicianId?: string; at?: string };

type Shop = Pick<Business, "id" | "name" | "timezone" | "hoursJson" | "servicesJson" | "trade"> & { jobLengthsJson?: string | null };

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
  touch: () => void = () => {},
  proposalId = "",
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
    touch();
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
    if (action === "mark_contacted" && lead.status !== "new" && lead.status !== "contacted") {
      return { error: `${who} is already marked ${lead.status}. Nothing was changed.`, status: 409, reason: "lead_moved_on" };
    }

    let smsSid: string | undefined;
    if (action === "sms_followup") {
      if (!lead.phone) return { error: "Lead has no phone", status: 400 };
      if (lead.status !== "new" && lead.status !== "contacted") {
        return { error: `${who} is already marked ${lead.status}, so no follow-up went out. Nothing was changed.`, status: 409, reason: "lead_moved_on" };
      }
      let sms: Awaited<ReturnType<typeof sendCustomerSms>>;
      try {
        sms = await sendCustomerSms({
          businessId: business.id,
          to: lead.phone,
          body: `Hi${lead.name ? ` ${lead.name}` : ""} — this is ${business.name}. We received your service request and will follow up shortly. Reply STOP to opt out.`,
          intent: { eventType: "copilot.sms_followup", eventId: proposalId || lead.id, authorizedBy: "command:approved" },
        });
      } catch (error) {
        // A thrown send (timeout, carrier error) may still have gone out.
        touch();
        throw error;
      }
      if (sms.sent) touch();
      if (!sms.sent) {
        const optedOut = sms.reason === "customer_opted_out";
        return {
          error: optedOut
            ? "This customer opted out of texts."
            : sms.reason === "sender_not_verified"
              ? `${sms.detail ?? "Texting isn't verified with the carriers yet."} Nothing was sent.`
              : "Texting is not connected for this workspace yet.",
          reason: sms.reason,
          status: optedOut ? 409 : 503,
        };
      }
      smsSid = sms.sid;
    }
    if (lead.status === "new") {
      touch();
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
    return runWindowProposal(business, action, params, touch);
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
  touch: () => void,
): Promise<RunOutcome> {
  const at = params.at ? new Date(params.at) : null;
  if (!at || Number.isNaN(at.getTime())) return { error: "Invalid window", status: 400 };
  const shop = await prisma.business.findUniqueOrThrow({
    where: { id: business.id },
    select: { id: true, name: true, timezone: true, hoursJson: true, servicesJson: true, jobLengthsJson: true, trade: true },
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
      touch();
      throw error;
    }
    touch();
    const booked = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: { technician: { select: { name: true } } },
    });
    const who = lead.name ?? lead.phone ?? "the caller";
    const held = lead.phone ? await textingHeld(business.id) : null;
    return {
      result: { jobId: job.id, leadId: lead.id, scheduledAt: at.toISOString(), technician: booked.technician?.name ?? null },
      summary: `Booked ${who} for ${when} as a proposed window${
        booked.technician ? ` with ${booked.technician.name}` : ". No qualified technician is free then, so the booking is kept and assignment needs you"
      }. ${
        !lead.phone
          ? "No phone on file — call to confirm."
          : held
            ? `Texting isn't ready (${held.detail}), so no confirmation text goes out — call ${who} to confirm.`
            : "The confirmation text is queued; the outcome shows whether it went."
      }`,
      entity: { type: "job", id: job.id },
      links: { jobId: job.id, leadId: lead.id, customerId: job.customerId },
    };
  }

  if (!params.jobId) return { error: "Invalid reschedule params", status: 400 };
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, businessId: business.id },
    include: { technician: { omit: { appToken: true } }, customer: { select: { name: true } }, lead: { select: { name: true } } },
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
  touch();
  await prisma.job.update({
    where: { id: job.id },
    data: {
      scheduledAt: at,
      status: job.status === "confirmed" ? "scheduled" : job.status,
      customerConfirmedAt: null,
      techAcceptedAt: null,
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
    techSent = await notifyTechOnReschedule({
      businessId: business.id,
      jobId: job.id,
      businessName: business.name,
      techPhone: job.technician.phone,
      title: job.title,
      when,
      address: job.address,
    });
  }
  const who = job.customer?.name ?? job.lead?.name ?? "the customer";
  return {
    result: { jobId: job.id, from: from?.toISOString() ?? null, to: at.toISOString(), customerText: confirm, techText: techSent, technician: job.technician?.name ?? null },
    summary: `Moved ${job.title} to ${when}. ${
      confirm.sent ? `Texted ${who} the new window to confirm` : `The text to ${who} did not send (${(confirm.reason ?? "unknown").replace(/_/g, " ")}) — call them`
    }${job.technician ? (techSent ? ` and told ${job.technician.name}` : `; tell ${job.technician.name} directly`) : ". Nobody is assigned yet; pick who goes next"}.`,
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
      /** False when the change happened but Orvius couldn't save its record; the item is flagged to check. */
      recorded: boolean;
    };

/** An approval still "executing" after this long crashed mid-run: someone has to check what happened. */
export const STALE_EXECUTING_MS = 5 * 60_000;

export { PROPOSAL_FRESH_MS };

/**
 * Proposal lifecycle (CopilotAction.status):
 *   proposed → executing → executed      confirmed success
 *   executing → proposed (+ failedBeforeEffect)  refused or failed before anything changed
 *   executing → reconcile                 something may have changed but the outcome is unknown,
 *                                         or it changed and the record couldn't be saved
 * A reconcile item is never re-run automatically: a person marks it done or
 * not done (resolveReconcile), and only "not done" puts it back for approval.
 */
export function needsCheck(item: { status: string; createdAt: Date; executedAt?: Date | null }, now = new Date()) {
  if (item.status === "reconcile") return true;
  return item.status === "executing" && now.getTime() - item.createdAt.getTime() > STALE_EXECUTING_MS;
}

/**
 * recordAudit never throws, and a null id means either a failed write or a row
 * already there under this key, so the row itself decides.
 */
export async function auditOrThrow(input: AuditInput): Promise<string> {
  const id = await recordAudit(input);
  if (id) return id;
  const existing = input.idempotencyKey
    ? await prisma.auditEvent.findFirst({ where: { businessId: input.businessId, idempotencyKey: input.idempotencyKey }, select: { id: true } })
    : null;
  if (!existing) throw new Error(`audit row not written: ${input.action}`);
  return existing.id;
}

/** Stored plan parameters, or null when they can't be read. Parsed before any status changes, never after. */
export function readParams(json: string | null | undefined): ProposalParams | null {
  try {
    const value = JSON.parse(json ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ProposalParams) : null;
  } catch {
    return null;
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function flagForCheck(proposalId: string, detail: Record<string, unknown>) {
  try {
    await prisma.copilotAction.update({
      where: { id: proposalId },
      data: { status: "reconcile", resultJson: JSON.stringify({ reconcile: true, ...detail }) },
    });
  } catch (error) {
    // Left at "executing"; needsCheck() surfaces it once it is stale.
    console.error("[copilot] could not flag approval for check", proposalId, errorText(error));
  }
}

/**
 * Run one approved proposal exactly once. The proposal is claimed before
 * anything changes, so a double click or a retried request cannot run it
 * twice. A refusal before any change releases the claim so the owner can fix
 * the cause and approve again; anything that fails after a change started is
 * held for a person to check instead of being retried.
 */
async function stillOnTeam(businessId: string, email: string) {
  const who = email.trim().toLowerCase();
  const [shop, member] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { ownerEmail: true } }),
    prisma.membership.findUnique({ where: { businessId_email: { businessId, email: who } }, select: { id: true } }),
  ]);
  return Boolean(member) || shop?.ownerEmail?.trim().toLowerCase() === who;
}

export async function executeProposal(params: {
  business: { id: string; name: string };
  proposalId: string;
  by: { role: string; email: string };
}): Promise<ExecuteOutcome> {
  const { business } = params;
  const pending = await prisma.copilotAction.findFirst({
    where: { id: params.proposalId, businessId: business.id, status: "proposed" },
    select: { action: true, proposedByEmail: true, createdAt: true },
  });
  if (!pending) return { ok: false, error: "Proposal not found or already used", status: 404 };
  if (Date.now() - pending.createdAt.getTime() > PROPOSAL_FRESH_MS) {
    return { ok: false, error: "This plan is more than 12 hours old, so it may not fit the shop any more. Ask Command for a fresh one. Nothing was changed.", status: 409, reason: "proposal_stale" };
  }
  // The 12-hour limit only bounds how old the picture the approver saw can be; who may act, and whether the
  // target is still eligible, is read again now (here and in runProposal), never trusted from the proposal.
  if (pending.proposedByEmail && !(await stillOnTeam(business.id, pending.proposedByEmail))) {
    return { ok: false, error: "The person who asked for this plan is no longer on the team, so it won't run. Ask Command for a fresh one. Nothing was changed.", status: 409, reason: "proposer_removed" };
  }
  const decision = decideApproval({ actor: params.by, proposal: pending, grants: await grantsForActor(business.id, params.by.email) });
  if (!decision.ok) return { ok: false, error: decision.error, status: 403, reason: "no_command_authority" };
  const stored = await prisma.copilotAction.findFirst({ where: { id: params.proposalId, businessId: business.id }, select: { paramsJson: true } });
  const planParams = readParams(stored?.paramsJson);
  if (!planParams) {
    await prisma.copilotAction.updateMany({
      where: { id: params.proposalId, businessId: business.id, status: "proposed" },
      data: { resultJson: JSON.stringify({ failedBeforeEffect: true, error: "unreadable plan details" }) },
    });
    return { ok: false, error: "This plan's details can't be read, so it didn't run. Nothing was changed. Ask Command for a fresh one.", status: 409, reason: "failed_before_effect" };
  }
  const twin = await openTwin(business.id, pending.action, stored!.paramsJson, params.proposalId);
  if (twin && twin.status !== "proposed") return refuseTwin(twin.status);
  const claimed = await prisma.copilotAction.updateMany({
    where: { id: params.proposalId, businessId: business.id, status: "proposed" },
    data: { status: "executing", approvalKind: decision.kind, approvedByEmail: params.by.email.trim().toLowerCase(), grantId: decision.grantId },
  });
  if (claimed.count === 0) {
    return { ok: false, error: "Proposal not found or already used", status: 404 };
  }
  // Two copies approved at once both pass the check above; whichever sees the other after claiming steps back.
  const racing = await openTwin(business.id, pending.action, stored!.paramsJson, params.proposalId);
  if (racing && racing.status !== "proposed") {
    await prisma.copilotAction.updateMany({ where: { id: params.proposalId, status: "executing" }, data: { status: "proposed", approvalKind: null, approvedByEmail: null, grantId: null } });
    return refuseTwin(racing.status);
  }
  const proposal = await prisma.copilotAction.findUniqueOrThrow({ where: { id: params.proposalId } });

  let touched = false;
  let outcome: RunOutcome;
  try {
    outcome = await runProposal(
      business,
      proposal.action,
      planParams,
      () => {
        touched = true;
      },
      proposal.id,
    );
  } catch (error) {
    if (!touched) {
      await prisma.copilotAction.update({
        where: { id: proposal.id },
        data: { status: "proposed", resultJson: JSON.stringify({ failedBeforeEffect: true, error: errorText(error) }) },
      });
      return { ok: false, error: "That didn't go through. Nothing was changed — you can approve it again.", status: 500, reason: "failed_before_effect" };
    }
    await flagForCheck(proposal.id, { stage: "effect", error: errorText(error) });
    return {
      ok: false,
      error: "This stopped partway, so part of it may have happened. It's flagged in Command to check — don't approve it again until you have.",
      status: 500,
      reason: "needs_check",
    };
  }
  if ("error" in outcome) {
    if (touched) {
      await flagForCheck(proposal.id, { stage: "effect", error: outcome.error, reason: outcome.reason ?? null });
      return { ok: false, error: `${outcome.error} Part of it may have happened, so it's flagged in Command to check.`, status: outcome.status, reason: "needs_check" };
    }
    await prisma.copilotAction.update({ where: { id: proposal.id }, data: { status: "proposed" } });
    return { ok: false, error: outcome.error, status: outcome.status, reason: outcome.reason };
  }

  const executedAt = new Date();
  let auditId: string | null = null;
  let stage = "save";
  try {
    await prisma.copilotAction.update({
      where: { id: proposal.id },
      data: { status: "executed", executedAt, resultJson: JSON.stringify(outcome.result) },
    });
    await prisma.copilotAction
      .updateMany({
        where: { businessId: business.id, action: proposal.action, paramsJson: proposal.paramsJson, status: "proposed", id: { not: proposal.id } },
        data: { status: "superseded", resultJson: JSON.stringify({ supersededBy: proposal.id }) },
      })
      .catch(() => undefined);
    stage = "audit";
    auditId = await auditOrThrow({
      businessId: business.id,
      entityType: outcome.entity.type,
      entityId: outcome.entity.id,
      action: "copilot.executed",
      ...personActor(params.by),
      summary: decision.kind === "owner_confirmation" ? `${outcome.summary} (Owner confirmed their own request.)` : outcome.summary,
      detail: {
        proposalId: proposal.id,
        action: proposal.action,
        preview: proposal.preview,
        approval: { kind: decision.kind, grantId: decision.grantId, policyVersion: COMMAND_POLICY_VERSION, proposedBy: proposal.proposedByEmail, approvedBy: params.by.email },
        ...outcome.result,
      },
      jobId: outcome.links.jobId ?? null,
      leadId: outcome.links.leadId ?? null,
      customerId: outcome.links.customerId ?? null,
      idempotencyKey: `copilot:${proposal.id}:executed`,
    });
  } catch (error) {
    await flagForCheck(proposal.id, { stage, done: true, summary: outcome.summary, result: outcome.result, error: errorText(error) });
    return {
      ok: true,
      proposalId: proposal.id,
      result: outcome.result,
      confirmation: {
        summary: `${outcome.summary} It went through, but Orvius couldn't save the record, so it's flagged in Command to confirm.`,
        auditId: null,
        at: executedAt.toISOString(),
      },
      recorded: false,
    };
  }

  return {
    ok: true,
    proposalId: proposal.id,
    result: outcome.result,
    confirmation: { summary: outcome.summary, auditId, at: executedAt.toISOString() },
    recorded: true,
  };
}

/** `recorded: false` only when the decision saved but its history row didn't. */
export type ResolveOutcome = { ok: true; status: "executed" | "proposed"; recorded?: false } | { ok: false; error: string; status: number };

/** A person checked a flagged approval: it happened ("done"), or it didn't and can be approved again ("not_done"). */
export async function resolveReconcile(params: {
  business: { id: string };
  proposalId: string;
  happened: boolean;
  by: { role: string; email: string };
  now?: Date;
}): Promise<ResolveOutcome> {
  const now = params.now ?? new Date();
  const item = await prisma.copilotAction.findFirst({ where: { id: params.proposalId, businessId: params.business.id } });
  if (!item || !needsCheck(item, now)) return { ok: false, error: "Nothing to check on this one", status: 404 };
  let known: { done?: boolean } | null = null;
  try {
    known = item.resultJson ? JSON.parse(item.resultJson) : null;
  } catch {}
  if (!params.happened && known?.done) {
    return { ok: false, error: "This one went through — only the record is missing, so confirm it instead.", status: 409 };
  }
  const next = params.happened ? "executed" : "proposed";
  const p = readParams(item.paramsJson) ?? {};
  const moved = await prisma.copilotAction.updateMany({
    where: { id: item.id, status: item.status },
    data: params.happened ? { status: next, executedAt: item.executedAt ?? now } : { status: next },
  });
  if (moved.count === 0) return { ok: false, error: "Someone else just resolved this", status: 409 };
  // The decision is already saved; a failed record is reported, not turned into an error that invites a repeat.
  const recorded = await auditOrThrow({
    businessId: params.business.id,
    entityType: p.jobId ? "job" : p.leadId ? "lead" : "copilot",
    entityId: p.jobId ?? p.leadId ?? item.id,
    action: params.happened ? "copilot.reconciled_done" : "copilot.reconciled_not_done",
    ...personActor(params.by),
    summary: params.happened
      ? `Checked and confirmed it happened: ${item.preview}`
      : `Checked and confirmed it did not happen — back for approval: ${item.preview}`,
    detail: { proposalId: item.id, action: item.action, was: known },
    jobId: p.jobId ?? null,
    leadId: p.leadId ?? null,
    idempotencyKey: `copilot:${item.id}:reconciled:${item.status}:${now.getTime()}`,
  }).then(
    () => true,
    (error: unknown) => {
      console.error("[copilot] resolved but unrecorded", item.id, errorText(error));
      return false;
    },
  );
  return { ok: true, status: next, ...(recorded ? {} : { recorded: false as const }) };
}
