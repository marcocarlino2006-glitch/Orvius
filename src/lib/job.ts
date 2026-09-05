import { prisma } from "@/lib/prisma";
import { jobTitle, suggestedSchedule } from "@/lib/job-schedule";
import type { JobStatus } from "@/lib/job-status";

export { suggestedSchedule, jobTitle } from "@/lib/job-schedule";
export { JOB_STATUSES, isJobStatus, jobStatusLabel } from "@/lib/job-status";
export type { JobStatus } from "@/lib/job-status";

export const JOB_INCLUDE = {
  business: { select: { id: true, name: true, avgTicketCents: true } },
  customer: {
    select: { id: true, name: true, phone: true, address: true, interactionCount: true },
  },
  lead: { select: { id: true, name: true, phone: true } },
  technician: { select: { id: true, name: true, phone: true } },
  estimate: {
    select: {
      id: true,
      amountCents: true,
      status: true,
      publicToken: true,
      sentAt: true,
      acceptedAt: true,
      invoice: {
        select: {
          id: true,
          amountCents: true,
          status: true,
          payments: { select: { id: true, amountCents: true, status: true } },
        },
      },
    },
  },
} as const;

export function serializeJob<
  T extends {
    scheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date | null;
    dispatchedAt?: Date | null;
    onSiteAt?: Date | null;
    completedAt?: Date | null;
  },
>(job: T) {
  return {
    ...job,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    confirmedAt: job.confirmedAt?.toISOString() ?? null,
    dispatchedAt: job.dispatchedAt?.toISOString() ?? null,
    onSiteAt: job.onSiteAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function createJobFromLead(params: {
  leadId: string;
  scheduledAt?: Date | string | null;
  notes?: string | null;
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    include: {
      job: true,
      business: { select: { id: true, name: true } },
    },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (!lead.businessId) {
    throw new Error("Lead is not attached to a business");
  }

  if (lead.job) {
    return lead.job;
  }

  const scheduledAt = params.scheduledAt
    ? new Date(params.scheduledAt)
    : suggestedSchedule(lead.urgency);

  const extraNotes = params.notes?.trim();
  const notes = [lead.notes, extraNotes].filter(Boolean).join("\n") || null;

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        businessId: lead.businessId!,
        customerId: lead.customerId,
        leadId: lead.id,
        title: jobTitle({ serviceType: lead.serviceType, name: lead.name }),
        serviceType: lead.serviceType,
        urgency: lead.urgency,
        address: lead.address,
        notes,
        status: "scheduled",
        scheduledAt,
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "booked" },
    });

    if (lead.callId) {
      await tx.call.update({
        where: { id: lead.callId },
        data: { booked: true },
      });
    }

    return created;
  });

  return job;
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const data: {
    status: JobStatus;
    confirmedAt?: Date;
    dispatchedAt?: Date;
    onSiteAt?: Date;
    completedAt?: Date;
  } = { status };

  if (status === "confirmed") data.confirmedAt = new Date();
  if (status === "en_route") data.dispatchedAt = new Date();
  if (status === "on_site") data.onSiteAt = new Date();
  if (status === "completed") data.completedAt = new Date();

  return prisma.job.update({
    where: { id: jobId },
    data,
  });
}
