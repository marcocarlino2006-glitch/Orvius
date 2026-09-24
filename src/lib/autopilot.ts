import { recordAudit } from "@/lib/audit";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { logInfo } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { prisma } from "@/lib/prisma";
import { recommendTechnician } from "@/lib/technician-match";
import { classifyRequest } from "@/lib/trade-playbooks";

/** Confirmation texts go out for appointments inside this window, never earlier. */
const CONFIRM_AHEAD_MS = 48 * 60 * 60 * 1000;
/** Too close to the appointment for a text to be the right move — a person should call. */
const CONFIRM_MIN_LEAD_MS = 2 * 60 * 60 * 1000;
const THROTTLE_MS = 5 * 60 * 1000;

export type AutopilotResult = {
  assigned: number;
  confirmationsSent: number;
  skipped: number;
};

const lastRun = new Map<string, number>();

/**
 * Routine work Orvius does without asking, each step idempotent and audited:
 *
 *  - text the customer to confirm an upcoming appointment that nobody has confirmed;
 *  - assign an unassigned job when one technician is clearly the right one.
 *
 * Anything with a judgment call (a tie between technicians, an appointment in the
 * next two hours, a safety case) stays on the owner's queue.
 */
export async function runAutopilot(
  businessId: string,
  options: { now?: Date; force?: boolean } = {},
): Promise<AutopilotResult | null> {
  const now = options.now ?? new Date();
  const previous = lastRun.get(businessId) ?? 0;
  if (!options.force && now.getTime() - previous < THROTTLE_MS) return null;
  lastRun.set(businessId, now.getTime());

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, autopilot: true, trade: true, servicesJson: true, isActive: true },
  });
  if (!business?.autopilot || !business.isActive) return null;

  const result: AutopilotResult = { assigned: 0, confirmationsSent: 0, skipped: 0 };

  const unassigned = await prisma.job.findMany({
    where: {
      businessId,
      technicianId: null,
      status: { in: ["scheduled", "confirmed"] },
      scheduledAt: { gt: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  for (const job of unassigned) {
    if (job.urgency === "emergency") {
      result.skipped += 1;
      continue;
    }
    const playbook = classifyRequest({
      business,
      serviceType: job.serviceType ?? job.title,
      notes: job.notes,
      urgency: job.urgency,
    });
    if (playbook.safety) {
      result.skipped += 1;
      continue;
    }
    const ranking = await recommendTechnician({
      businessId,
      scheduledAt: job.scheduledAt!,
      durationMin: job.durationMin ?? playbook.service.durationMin,
      skill: playbook.service.skill,
      excludeJobId: job.id,
    });
    if (!ranking.pick || !ranking.clearCut) {
      result.skipped += 1;
      continue;
    }
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, businessId, technicianId: null },
      data: { technicianId: ranking.pick.technicianId },
    });
    if (!claimed.count) continue;
    result.assigned += 1;
    const sms = await notifyTechOnAssign({
      jobId: job.id,
      previousTechnicianId: null,
      nextTechnicianId: ranking.pick.technicianId,
    });
    await recordAudit({
      businessId,
      entityType: "job",
      entityId: job.id,
      action: "autopilot.assigned",
      summary: `Assigned ${ranking.pick.name} to ${job.title} — ${ranking.pick.reason}${sms.sent ? "; texted them the details" : ""}.`,
      detail: { technicianId: ranking.pick.technicianId, reason: ranking.pick.reason, techSms: sms.sent },
      jobId: job.id,
      customerId: job.customerId,
      leadId: job.leadId,
      idempotencyKey: `autopilot:assign:${job.id}:${ranking.pick.technicianId}`,
    });
  }

  const unconfirmed = await prisma.job.findMany({
    where: {
      businessId,
      status: "scheduled",
      customerConfirmedAt: null,
      customerConfirmSentAt: null,
      scheduledAt: {
        gt: new Date(now.getTime() + CONFIRM_MIN_LEAD_MS),
        lt: new Date(now.getTime() + CONFIRM_AHEAD_MS),
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    select: { id: true, title: true, customerId: true, leadId: true },
  });
  for (const job of unconfirmed) {
    const sent = await sendCustomerConfirmSms(job.id);
    if (!sent.sent) {
      result.skipped += 1;
      continue;
    }
    result.confirmationsSent += 1;
    await recordAudit({
      businessId,
      entityType: "job",
      entityId: job.id,
      action: "autopilot.confirm_sent",
      summary: `Texted the customer to confirm ${job.title}.`,
      jobId: job.id,
      customerId: job.customerId,
      leadId: job.leadId,
      idempotencyKey: `autopilot:confirm:${job.id}`,
    });
  }

  if (result.assigned || result.confirmationsSent) {
    logInfo("autopilot.ran", { businessId, ...result });
  }
  return result;
}

/** Forget throttling state; tests run the autopilot back to back. */
export function resetAutopilotThrottle() {
  lastRun.clear();
}

export type HandledEvent = { id: string; at: string; summary: string; jobId: string | null; leadId: string | null };

export type Handled = {
  calls: number;
  booked: number;
  assigned: number;
  confirmations: number;
  escalated: number;
  events: HandledEvent[];
};

const FEED_ACTIONS = ["job.booked", "technician.assigned", "autopilot.assigned", "autopilot.confirm_sent", "lead.escalated", "lead.held"];

/** What Orvius did on its own in the window — the other half of the Command story. */
export async function listHandled(businessId: string, sinceMs = 24 * 60 * 60 * 1000, now = new Date()): Promise<Handled> {
  const since = new Date(now.getTime() - sinceMs);
  const where = { businessId, actor: { in: ["orvius", "system"] }, createdAt: { gte: since } };
  const [tallies, feed] = await Promise.all([
    prisma.auditEvent.groupBy({
      by: ["action"],
      where: { ...where, action: { in: ["call.answered", ...FEED_ACTIONS] } },
      _count: { _all: true },
    }),
    prisma.auditEvent.findMany({
      where: { ...where, action: { in: FEED_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, createdAt: true, summary: true, jobId: true, leadId: true },
    }),
  ]);
  const n = (...actions: string[]) =>
    tallies.filter((t) => actions.includes(t.action)).reduce((sum, t) => sum + t._count._all, 0);
  return {
    calls: n("call.answered"),
    booked: n("job.booked"),
    assigned: n("technician.assigned", "autopilot.assigned"),
    confirmations: n("autopilot.confirm_sent"),
    escalated: n("lead.escalated", "lead.held"),
    events: feed.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), summary: r.summary, jobId: r.jobId, leadId: r.leadId })),
  };
}
