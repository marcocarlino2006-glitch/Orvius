import { linkTouchToCustomer } from "@/lib/customer";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import {
  DEFAULT_JOB_DURATION_MIN,
  findAvailableSchedule,
} from "@/lib/availability";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { jobTitle } from "@/lib/job-schedule";
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
    customerConfirmedAt?: Date | null;
    dispatchedAt?: Date | null;
    onSiteAt?: Date | null;
    completedAt?: Date | null;
  },
>(job: T) {
  return {
    ...job,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    confirmedAt: job.confirmedAt?.toISOString() ?? null,
    customerConfirmedAt: job.customerConfirmedAt?.toISOString() ?? null,
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
      business: {
        select: {
          id: true,
          name: true,
          servicesJson: true,
          hoursJson: true,
          timezone: true,
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (!lead.businessId) {
    throw new Error("Lead is not attached to a business");
  }

  if (lead.job) {
    // Heal orphan jobs that somehow missed customer linking
    if (!lead.job.customerId && (lead.customerId || lead.phone)) {
      if (lead.customerId) {
        await prisma.job.update({
          where: { id: lead.job.id },
          data: { customerId: lead.customerId },
        });
      } else {
        await linkTouchToCustomer({
          businessId: lead.businessId,
          leadId: lead.id,
          jobId: lead.job.id,
          phone: lead.phone,
          name: lead.name,
          email: lead.email,
          address: lead.address,
        });
      }
      return prisma.job.findUniqueOrThrow({ where: { id: lead.job.id } });
    }
    return lead.job;
  }

  // Ensure the shop brain has this customer before the job lands
  let customerId = lead.customerId;
  if (!customerId && lead.phone) {
    const customer = await linkTouchToCustomer({
      businessId: lead.businessId,
      leadId: lead.id,
      callId: lead.callId ?? undefined,
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      address: lead.address,
      notes: lead.notes,
    });
    customerId = customer?.id ?? null;
  }

  let scheduledAt: Date;
  if (params.scheduledAt) {
    scheduledAt = new Date(params.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid appointment time");
    }
  } else {
    const [existing, activeTechnicians] = await Promise.all([
      prisma.job.findMany({
        where: {
          businessId: lead.businessId,
          status: { notIn: ["completed", "cancelled"] },
          scheduledAt: { not: null },
        },
        select: { scheduledAt: true },
      }),
      prisma.technician.count({
        where: { businessId: lead.businessId, isActive: true },
      }),
    ]);

    const available = findAvailableSchedule({
      urgency: lead.urgency,
      hoursJson: lead.business?.hoursJson ?? "{}",
      timezone: lead.business?.timezone ?? "America/New_York",
      capacity: Math.max(1, activeTechnicians),
      existing: existing.flatMap((job) =>
        job.scheduledAt
          ? [
              {
                scheduledAt: job.scheduledAt,
                durationMin: DEFAULT_JOB_DURATION_MIN,
              },
            ]
          : [],
      ),
    });

    if (!available) {
      throw new Error(
        "No appointment capacity in the next 14 days. Keep the lead open for manual scheduling.",
      );
    }
    scheduledAt = available;
  }

  const extraNotes = params.notes?.trim();
  const notes = [lead.notes, extraNotes].filter(Boolean).join("\n") || null;

  // Booked work is the half of the dataset that carries a price, so the job
  // has to land on the same code as the call. Leads written before capture
  // existed have none, so re-derive rather than book an uncountable job.
  const demand =
    lead.categoryCode || lead.postalCode
      ? { categoryCode: lead.categoryCode, postalCode: lead.postalCode }
      : deriveDemandSignal({
          serviceType: lead.serviceType,
          notes: lead.notes,
          address: lead.address,
          trade: tradeForCapture(lead.business ?? {}),
        });

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        businessId: lead.businessId!,
        customerId: customerId,
        leadId: lead.id,
        title: jobTitle({ serviceType: lead.serviceType, name: lead.name }),
        serviceType: lead.serviceType,
        urgency: lead.urgency,
        address: lead.address,
        notes,
        status: "scheduled",
        scheduledAt,
        categoryCode: demand.categoryCode,
        postalCode: demand.postalCode,
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: "booked",
        closedAt: new Date(),
        firstContactedAt: lead.firstContactedAt ?? new Date(),
        // Backfill the lead too, so the call and the job agree.
        categoryCode: lead.categoryCode ?? demand.categoryCode,
        postalCode: lead.postalCode ?? demand.postalCode,
      },
    });

    if (lead.callId) {
      await tx.call.update({
        where: { id: lead.callId },
        data: { booked: true },
      });
    }

    return created;
  });

  // Proposed window until the customer confirms — keep appointments honest.
  try {
    await sendCustomerConfirmSms(job.id);
  } catch (error) {
    logWarn("job.customer_confirm_sms_error", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

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
