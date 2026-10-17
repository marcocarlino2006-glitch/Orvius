import { ensureJobTechToken, retireTechLink } from "@/lib/ensure-tech-token";
import { JOB_INCLUDE, serializeJob } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { buildTechJobAssignMessage } from "@/lib/tech-assign-sms";
import { markTechNotified, resetTechAnswer } from "@/lib/tech-response";
import { ensureTechAppToken, techAppUrl } from "@/lib/tech-app-link";
import { raiseIntentException } from "@/lib/sms-intent";
import { sendSms, textingHeld } from "@/lib/twilio-sms";

/**
 * Notify the technician by SMS when a job is newly assigned to them.
 * Never throws — assign must succeed even if SMS fails.
 * SMS links to the public field page (/t/[token]) when possible.
 */
export async function notifyTechOnAssign(params: {
  jobId: string;
  previousTechnicianId: string | null;
  nextTechnicianId: string | null;
}): Promise<{ sent: boolean; reason?: string; techToken?: string }> {
  const { jobId, previousTechnicianId, nextTechnicianId } = params;

  if (previousTechnicianId && previousTechnicianId !== nextTechnicianId) {
    await retireTechLink(jobId).catch((err) => console.error("[tech-assign-sms] retire link", err));
  }

  if (nextTechnicianId !== previousTechnicianId) {
    await resetTechAnswer(jobId, nextTechnicianId).catch((err) => console.error("[tech-assign-sms] reset answer", err));
  }

  if (!nextTechnicianId || nextTechnicianId === previousTechnicianId) {
    return { sent: false, reason: "no_change" };
  }

  return deliverAssignSms(jobId);
}

/**
 * A job text for an assignment that already happened: the owner just added
 * the technician's number, so the ask starts now. Never touches assignment
 * timing — the job was assigned when it was assigned.
 */
async function deliverAssignSms(jobId: string): Promise<{ sent: boolean; reason?: string; techToken?: string }> {
  try {
    const techToken = await ensureJobTechToken(jobId);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    if (!job?.technician?.phone || !job.technicianId) {
      return { sent: false, reason: "no_phone", techToken };
    }

    const body = buildTechJobAssignMessage({
      id: job.id,
      title: job.title,
      address: job.address,
      scheduledAt: job.scheduledAt,
      urgency: job.urgency,
      serviceType: job.serviceType,
      customer: job.customer,
      lead: job.lead,
      business: job.business,
      techToken,
      openUrl: techAppUrl(await ensureTechAppToken(job.technician.id), job.id),
    });

    const result = await sendSms({
      to: job.technician.phone,
      body,
      businessId: job.businessId,
      audience: "tech",
      jobId: job.id,
      intent: {
        eventType: "job.tech_assigned",
        eventId: `${job.id}:${job.technicianId}@${job.scheduledAt?.toISOString() ?? "unscheduled"}${job.techAssignedAt ? `#${job.techAssignedAt.getTime()}` : ""}`,
        severity: "severe",
      },
    });
    if (!result) {
      return { sent: false, reason: "sms_unavailable", techToken };
    }

    await markTechNotified(job.id, job.technicianId);
    return { sent: true, techToken };
  } catch (err) {
    console.error("[tech-assign-sms]", err);
    return { sent: false, reason: "error" };
  }
}

export { serializeJob };

/**
 * The owner just added the technician's number. Every open job of theirs
 * that never got its job text — because there was nowhere to send it — gets
 * it now, oldest first. Jobs already answered, declined, or notified are
 * left alone. Never throws.
 */
export async function notifyTechPendingJobs(params: {
  businessId: string;
  technicianId: string;
  limit?: number;
}): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  try {
    const pending = await prisma.job.findMany({
      where: {
        businessId: params.businessId,
        technicianId: params.technicianId,
        status: { in: ["scheduled", "confirmed"] },
        techNotifiedAt: null,
        techAcceptedAt: null,
        techDeclinedAt: null,
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: params.limit ?? 10,
      select: { id: true },
    });
    for (const job of pending) {
      const result = await deliverAssignSms(job.id);
      if (result.sent) sent += 1;
      else skipped += 1;
    }
  } catch (err) {
    console.error("[tech-assign-sms] pending flush", err);
  }
  return { sent, skipped };
}

/** Long enough that the assign request's own send has finished. */
export const UNTOLD_GRACE_MS = 2 * 60_000;
const UNTOLD_LOOKBACK_MS = 24 * 60 * 60_000;

/**
 * Assignments whose job text never got recorded: the send failed before the
 * provider took it, the process died mid-send, or the provider took it and
 * the reply was lost before the job was stamped. Each is retried through the
 * same intent key, so a text the provider already took is stamped without a
 * second send, one that may have left is closed as unknown with an owner
 * exception, and only a text that never left goes out. Never throws.
 */
export async function sweepUntoldAssignments(options: { now?: Date; limit?: number; eligible?: (businessId: string) => Promise<boolean> } = {}) {
  const now = options.now ?? new Date();
  const result = { checked: 0, sent: 0, unsent: 0, held: 0 };
  const eligible = options.eligible ?? (async (businessId: string) => !(await textingHeld(businessId)));
  const ready = new Map<string, boolean>();
  try {
    const jobs = await prisma.job.findMany({
      where: {
        status: { in: ["scheduled", "confirmed"] },
        technicianId: { not: null },
        technician: { phone: { not: null } },
        techNotifiedAt: null,
        techAcceptedAt: null,
        techDeclinedAt: null,
        /*
          Recent assignments, plus older ones still ahead on the schedule: a
          job text held while the shop's sender wasn't verified goes out once
          it is, instead of aging out of the window untold.
        */
        OR: [
          { techAssignedAt: { lte: new Date(now.getTime() - UNTOLD_GRACE_MS), gte: new Date(now.getTime() - UNTOLD_LOOKBACK_MS) } },
          { techAssignedAt: { lt: new Date(now.getTime() - UNTOLD_LOOKBACK_MS) }, scheduledAt: { gte: now } },
        ],
        business: { isActive: true },
      },
      orderBy: { techAssignedAt: "desc" },
      take: options.limit ?? 50,
      select: { id: true, businessId: true, technicianId: true, techAssignedAt: true },
    });
    for (const job of jobs) {
      result.checked += 1;
      if (!ready.has(job.businessId)) ready.set(job.businessId, await eligible(job.businessId).catch(() => false));
      if (!ready.get(job.businessId)) {
        result.held += 1;
        continue;
      }
      const prior = await priorAssignText(job, now);
      if (prior === "sent") {
        await markTechNotified(job.id, job.technicianId!);
        result.sent += 1;
        continue;
      }
      if (prior === "settled") {
        result.unsent += 1;
        continue;
      }
      const sent = await deliverAssignSms(job.id);
      if (sent.sent) result.sent += 1;
      else result.unsent += 1;
    }
  } catch (err) {
    console.error("[tech-assign-sms] untold sweep", err);
  }
  return result;
}

/*
  Any job text already attempted for this assignment, whatever key it was
  written under. Taken by the provider means stamp it; closed, in flight, or
  a lease that died mid-send means never send again — a dead lease is closed
  as unknown so the owner hears it may not have gone out.
*/
async function priorAssignText(
  job: { id: string; businessId: string; technicianId: string | null; techAssignedAt: Date | null },
  now: Date,
): Promise<"sent" | "settled" | null> {
  if (!job.technicianId || !job.techAssignedAt) return "settled";
  const rows = await prisma.smsIntent.findMany({
    where: {
      businessId: job.businessId,
      eventType: "job.tech_assigned",
      eventId: { startsWith: `${job.id}:${job.technicianId}@` },
      createdAt: { gte: job.techAssignedAt },
    },
  });
  if (!rows.length) return null;
  if (rows.some((r) => ["submitted", "delivered", "undelivered"].includes(r.status))) return "sent";
  for (const row of rows) {
    if (row.status === "leased" && (!row.leaseUntil || row.leaseUntil.getTime() <= now.getTime())) {
      const closed = await prisma.smsIntent.updateMany({
        where: { id: row.id, status: "leased", updatedAt: row.updatedAt },
        data: { status: "unknown_submission", leaseUntil: null, lastError: "lease expired mid-send" },
      });
      if (closed.count) await raiseIntentException({ ...row, status: "unknown_submission" });
    }
  }
  return "settled";
}

/** Tell the assigned technician their job moved. Never throws. */
export async function notifyTechOnReschedule(params: {
  businessId: string;
  jobId: string;
  businessName: string;
  techPhone: string;
  title: string;
  when: string;
  address: string | null;
}): Promise<boolean> {
  try {
    const result = await sendSms({
      to: params.techPhone,
      body: `${params.businessName}: ${params.title} moved to ${params.when}.${params.address ? ` ${params.address}.` : ""}`,
      businessId: params.businessId,
      audience: "tech",
      jobId: params.jobId,
      intent: { eventType: "job.tech_rescheduled", eventId: `${params.jobId}@${params.when}`, severity: "severe" },
    });
    return Boolean(result);
  } catch (err) {
    console.error("[tech-reschedule-sms]", err);
    return false;
  }
}
