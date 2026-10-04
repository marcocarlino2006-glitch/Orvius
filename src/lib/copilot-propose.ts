import type { Business } from "@prisma/client";
import { DEFAULT_JOB_DURATION_MIN, formatShopTime, MAX_SCHEDULE_DAYS } from "@/lib/availability";
import { findOpenSlots } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { classifyRequest } from "@/lib/trade-playbooks";

export const COPILOT_ACTIONS = ["assign_tech", "mark_contacted", "sms_followup", "book_window", "reschedule"] as const;
export type CopilotActionName = (typeof COPILOT_ACTIONS)[number];

export type ProposeInput = {
  action: CopilotActionName;
  jobId?: string;
  leadId?: string;
  technicianId?: string;
  /** ISO start of the window, for book_window and reschedule. */
  at?: string;
};

export type ProposeOutcome =
  | { ok: true; proposalId: string; action: string; preview: string; params: Record<string, string> }
  | { ok: false; error: string; status: number; reason?: string; alternatives?: string[] };

type Shop = Pick<Business, "id" | "name" | "timezone" | "hoursJson" | "servicesJson" | "trade">;

type SlotTarget =
  | { kind: "lead"; lead: { serviceType: string | null; notes: string | null; urgency: string | null } }
  | { kind: "job"; job: { id: string; serviceType: string | null; notes: string | null; urgency: string | null; durationMin: number | null } };

function slotParams(shop: Shop, target: SlotTarget) {
  const source = target.kind === "lead" ? target.lead : target.job;
  const playbook = classifyRequest({
    business: shop,
    serviceType: source.serviceType,
    notes: source.notes,
    urgency: source.urgency,
  });
  return {
    playbook,
    params: {
      businessId: shop.id,
      urgency: null,
      durationMin:
        target.kind === "job" ? (target.job.durationMin ?? playbook.service.durationMin) : playbook.service.durationMin,
      skill: playbook.service.skill,
      hoursJson: shop.hoursJson ?? "{}",
      timezone: shop.timezone ?? "America/New_York",
      ...(target.kind === "job" ? { excludeJobId: target.job.id } : {}),
    },
  };
}

/**
 * Real openings only: shop hours, booked jobs, live-call holds and the owner's
 * busy calendar all count. Nothing here guesses a time the schedule can't keep.
 */
export async function openWindows(shop: Shop, target: SlotTarget, count = 3): Promise<Date[]> {
  const { params } = slotParams(shop, target);
  return findOpenSlots(params, { count, minGapMin: 60 });
}

export async function isWindowOpen(shop: Shop, target: SlotTarget, at: Date): Promise<boolean> {
  const { params } = slotParams(shop, target);
  return (await findOpenSlots(params, { count: 1, onlyAt: at })).length > 0;
}

export function windowLabel(at: Date, timezone: string | null | undefined) {
  return formatShopTime(at, timezone ?? "America/New_York");
}

function parseAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

async function refuseTaken(shop: Shop, target: SlotTarget, at: Date, what: string): Promise<ProposeOutcome> {
  const next = await openWindows(shop, target, 3);
  const tz = shop.timezone;
  return {
    ok: false,
    status: 409,
    reason: "window_unavailable",
    error: next.length
      ? `${windowLabel(at, tz)} is not open for ${what}. Open times: ${next.map((d) => windowLabel(d, tz)).join("; ")}.`
      : `${windowLabel(at, tz)} is not open for ${what}, and nothing is open in the next ${MAX_SCHEDULE_DAYS} days.`,
    alternatives: next.map((d) => d.toISOString()),
  };
}

/**
 * Turn a request into a proposal the owner approves. Nothing changes here: the
 * preview is the plan, and execution re-checks every step (copilot-execute).
 */
export async function proposeAction(shop: Shop, input: ProposeInput): Promise<ProposeOutcome> {
  let preview = "";
  const params: Record<string, string> = {};
  const tz = shop.timezone;

  if (input.action === "assign_tech") {
    if (!input.jobId || !input.technicianId) return { ok: false, error: "jobId and technicianId required", status: 400 };
    const [job, tech] = await Promise.all([
      prisma.job.findFirst({ where: { id: input.jobId, businessId: shop.id } }),
      prisma.technician.findFirst({ where: { id: input.technicianId, businessId: shop.id } }),
    ]);
    if (!job || !tech) return { ok: false, error: "Job or technician not found", status: 404 };
    params.jobId = job.id;
    params.technicianId = tech.id;
    const slot = job.scheduledAt ? ` for ${windowLabel(job.scheduledAt, tz)}` : "";
    preview = `Assign ${tech.name} to “${job.title}”${slot}${tech.phone ? " and text them the job details" : ""}.`;
  } else if (input.action === "mark_contacted" || input.action === "sms_followup") {
    if (!input.leadId) return { ok: false, error: "leadId required", status: 400 };
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, businessId: shop.id } });
    if (!lead) return { ok: false, error: "Lead not found", status: 404 };
    if (input.action === "sms_followup" && !lead.phone) return { ok: false, error: "Lead has no phone", status: 400 };
    params.leadId = lead.id;
    preview =
      input.action === "mark_contacted"
        ? `Mark lead “${lead.name ?? lead.phone ?? lead.id}” as contacted.`
        : `Text ${lead.name ?? lead.phone} a follow-up from ${shop.name}.`;
  } else if (input.action === "book_window") {
    const at = parseAt(input.at);
    if (!input.leadId || !at) return { ok: false, error: "leadId and a window time are required", status: 400 };
    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, businessId: shop.id },
      include: { job: { select: { id: true } } },
    });
    if (!lead) return { ok: false, error: "Request not found", status: 404 };
    if (lead.job) return { ok: false, error: "This request already has a job.", status: 409, reason: "already_booked" };
    if (lead.status === "spam" || lead.status === "lost") {
      return { ok: false, error: `This request is closed as ${lead.status}.`, status: 409, reason: "lead_closed" };
    }
    if (!lead.address?.trim()) {
      return { ok: false, error: "This request has no service address yet — get it before booking.", status: 409, reason: "missing_address" };
    }
    const target: SlotTarget = { kind: "lead", lead };
    const who = lead.name ?? lead.phone ?? "the caller";
    if (!(await isWindowOpen(shop, target, at))) return refuseTaken(shop, target, at, who);
    const { playbook } = slotParams(shop, target);
    params.leadId = lead.id;
    params.at = at.toISOString();
    preview = [
      `Book ${who} — ${lead.serviceType ?? playbook.service.label} — ${windowLabel(at, tz)} (${playbook.service.durationMin} min).`,
      "1. Re-check that this time is still open (shop hours, booked jobs, live holds, busy calendar).",
      "2. Create the job and hold the window as a proposed booking.",
      `3. Assign a free technician who does ${playbook.service.skill} work, if one is free.`,
      lead.phone
        ? `4. Text ${who} the window with a confirm link — it stays proposed until they confirm.`
        : "4. No phone on file, so no confirmation text — call to confirm.",
      "5. Log every step in the request's trace. No price is quoted.",
    ].join("\n");
  } else if (input.action === "reschedule") {
    const at = parseAt(input.at);
    if (!input.jobId || !at) return { ok: false, error: "jobId and a new window time are required", status: 400 };
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, businessId: shop.id },
      include: { technician: { select: { name: true } }, customer: { select: { name: true, phone: true } }, lead: { select: { name: true, phone: true } } },
    });
    if (!job) return { ok: false, error: "Job not found", status: 404 };
    if (job.status === "completed" || job.status === "cancelled") {
      return { ok: false, error: `This job is already ${job.status}.`, status: 409, reason: "job_closed" };
    }
    if (job.scheduledAt && job.scheduledAt.getTime() === at.getTime()) {
      return { ok: false, error: "The job is already at that time.", status: 409, reason: "no_change" };
    }
    const target: SlotTarget = { kind: "job", job };
    const who = job.customer?.name ?? job.lead?.name ?? "the customer";
    if (!(await isWindowOpen(shop, target, at))) return refuseTaken(shop, target, at, job.title);
    const phone = job.customer?.phone ?? job.lead?.phone;
    params.jobId = job.id;
    params.at = at.toISOString();
    preview = [
      `Move “${job.title}” for ${who}${job.scheduledAt ? ` from ${windowLabel(job.scheduledAt, tz)}` : ""} to ${windowLabel(at, tz)} (${job.durationMin ?? DEFAULT_JOB_DURATION_MIN} min).`,
      "1. Re-check that the new time is still open.",
      job.technician
        ? `2. Keep ${job.technician.name} on it only if they are free then; otherwise stop and ask.`
        : "2. No technician assigned yet.",
      "3. Clear the earlier confirmation — the new time needs its own.",
      phone ? `4. Text ${who} the new window with a confirm link.` : "4. No phone on file — call to confirm.",
      job.technician ? `5. Text ${job.technician.name} the new time.` : "5. Log every step in the request's trace.",
    ].join("\n");
  } else {
    return { ok: false, error: "Unknown action", status: 400 };
  }

  const proposal = await prisma.copilotAction.create({
    data: { businessId: shop.id, action: input.action, paramsJson: JSON.stringify(params), preview, status: "proposed" },
  });
  return { ok: true, proposalId: proposal.id, action: proposal.action, preview, params };
}
