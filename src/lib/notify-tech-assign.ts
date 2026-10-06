import { ensureJobTechToken, retireTechLink } from "@/lib/ensure-tech-token";
import { JOB_INCLUDE, serializeJob } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { buildTechJobAssignMessage } from "@/lib/tech-assign-sms";
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

  if (!nextTechnicianId || nextTechnicianId === previousTechnicianId) {
    return { sent: false, reason: "no_change" };
  }

  try {
    const techToken = await ensureJobTechToken(jobId);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    if (!job?.technician?.phone) {
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
    });

    const result = await sendSms({
      to: job.technician.phone,
      body,
      businessId: job.businessId,
      audience: "tech",
    });
    if (!result) {
      return { sent: false, reason: "sms_unavailable", techToken };
    }

    return { sent: true, techToken };
  } catch (err) {
    console.error("[tech-assign-sms]", err);
    return { sent: false, reason: "error" };
  }
}

export { serializeJob };

/** Tell the assigned technician their job moved. Never throws. */
export async function notifyTechOnReschedule(params: {
  businessId: string;
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
    });
    return Boolean(result);
  } catch (err) {
    console.error("[tech-reschedule-sms]", err);
    return false;
  }
}
