import { ensureJobTechToken, retireTechLink } from "@/lib/ensure-tech-token";
import { JOB_INCLUDE, serializeJob } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { buildTechJobAssignMessage } from "@/lib/tech-assign-sms";
import { markTechNotified, resetTechAnswer } from "@/lib/tech-response";
import { ensureTechAppToken, techAppUrl } from "@/lib/tech-app-link";
import { sendSms } from "@/lib/twilio-sms";

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
        eventId: `${job.id}:${nextTechnicianId}@${job.scheduledAt?.toISOString() ?? "unscheduled"}`,
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
