import { formatShopTime } from "@/lib/availability";
import { recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { retireTechLink } from "@/lib/ensure-tech-token";
import { FieldError } from "@/lib/job-field";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";

/*
  A technician on a job is a separate fact from the customer confirming it.
  Assigning someone asks them; they answer "I'll take it" or "I can't". A
  decline takes them off the job and tells the owner, so the visit waits
  visibly for a new technician instead of sitting on someone who isn't going.
*/

const OPEN_FOR_ANSWER = ["scheduled", "confirmed"];

export type TechAnswerJob = { id: string; businessId: string; technicianId: string | null };

/** A new technician on the job (or none) starts with no answer; who declined before is history once someone else is on it. */
export async function resetTechAnswer(jobId: string, nextTechnicianId: string | null, now = new Date()) {
  await prisma.job.update({
    where: { id: jobId },
    data: nextTechnicianId
      ? { techAssignedAt: now, techNotifiedAt: null, techAcceptedAt: null, techDeclinedAt: null, techDeclinedBy: null, techDeclineReason: null }
      : { techAssignedAt: null, techNotifiedAt: null, techAcceptedAt: null },
  });
}

/** Twilio took the job text for the technician who is still on the job. */
export async function markTechNotified(jobId: string, technicianId: string, now = new Date()) {
  await prisma.job.updateMany({ where: { id: jobId, technicianId }, data: { techNotifiedAt: now } });
}

/** A new time is a new ask: the technician said yes to the old one. */
export async function clearTechAcceptance(jobId: string) {
  await prisma.job.updateMany({ where: { id: jobId, techAcceptedAt: { not: null } }, data: { techAcceptedAt: null } });
}

export async function acceptJob(params: { job: TechAnswerJob; technician: { id: string; name: string }; at?: Date }) {
  const at = params.at ?? new Date();
  const { job, technician } = params;
  const done = await prisma.job.updateMany({
    where: { id: job.id, technicianId: technician.id, techAcceptedAt: null, status: { in: [...OPEN_FOR_ANSWER, "en_route", "on_site"] } },
    data: { techAcceptedAt: at },
  });
  if (done.count) {
    await recordAudit({
      businessId: job.businessId,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      action: "job.tech_accepted",
      actor: "technician",
      summary: `${technician.name} accepted the job`,
    });
  }
  return { accepted: true, changed: done.count > 0 };
}

export async function declineJob(params: { job: TechAnswerJob; technician: { id: string; name: string }; reason?: unknown; now?: Date }) {
  const now = params.now ?? new Date();
  const { job, technician } = params;
  const reason = typeof params.reason === "string" ? params.reason.trim().slice(0, 200) || null : null;
  const row = await prisma.job.findUnique({
    where: { id: job.id },
    select: {
      status: true,
      title: true,
      scheduledAt: true,
      leadId: true,
      customerId: true,
      customer: { select: { name: true } },
      lead: { select: { name: true } },
      business: { select: { id: true, name: true, timezone: true, ownerPhone: true, ownerEmail: true } },
    },
  });
  if (!row || !OPEN_FOR_ANSWER.includes(row.status)) {
    throw new FieldError("This job has already started. Call the office to hand it off.", 409);
  }
  const moved = await prisma.job.updateMany({
    where: { id: job.id, technicianId: technician.id, status: { in: OPEN_FOR_ANSWER } },
    data: {
      technicianId: null,
      techAssignedAt: null,
      techNotifiedAt: null,
      techAcceptedAt: null,
      techDeclinedAt: now,
      techDeclinedBy: technician.name.slice(0, 120),
      techDeclineReason: reason,
    },
  });
  if (!moved.count) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);

  await retireTechLink(job.id).catch((error) => logWarn("tech_decline.retire_link_failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) }));
  const because = reason ? `: "${reason}"` : "";
  await recordAudit({
    businessId: job.businessId,
    entityType: "job",
    entityId: job.id,
    jobId: job.id,
    leadId: row.leadId,
    customerId: row.customerId,
    action: "job.tech_declined",
    actor: "technician",
    summary: `${technician.name} can't take the job${because}`,
    detail: { technicianId: technician.id, reason },
  });

  const who = row.customer?.name ?? row.lead?.name ?? null;
  const when = row.scheduledAt ? ` on ${formatShopTime(row.scheduledAt, row.business.timezone ?? "America/New_York")}` : "";
  await enqueueOwnerAlert({
    businessId: row.business.id,
    businessName: row.business.name,
    ownerPhone: row.business.ownerPhone,
    ownerEmail: row.business.ownerEmail,
    dedupeKey: `tech_declined:${job.id}:${now.getTime()}`,
    message: `Orvius: ${technician.name} can't take ${who ? `${who}'s ` : "the "}${row.title} job${when}${because}. It has no technician now. Assign someone: ${getAppUrl()}/dashboard/jobs/${job.id}`,
  }).catch((error) => logWarn("tech_decline.alert_failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) }));

  return { declined: true };
}
