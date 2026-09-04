import { createJobFromLead } from "@/lib/job";
import { canAccessModule, getEffectivePlanId } from "@/lib/plan-features";
import { prisma } from "@/lib/prisma";

/** Sort priority on Today — emergency and same-day surface first. */
export function isPriorityUrgency(urgency?: string | null): boolean {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  return (
    key.includes("emergency") ||
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  );
}

/** @deprecated Use isPriorityUrgency — kept for imports during transition. */
export const isAutoBookUrgency = isPriorityUrgency;

/**
 * Qualified leads become jobs on Pro+ (and pilot).
 * Line stops at lead + owner alert — no orphaned jobs.
 */
export async function maybeAutoBookLead(leadId: string): Promise<{
  jobId: string | null;
  created: boolean;
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      job: { select: { id: true } },
      business: {
        select: {
          billingStatus: true,
          billingPlan: true,
          pilotEndsAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!lead?.businessId || lead.job) {
    return { jobId: lead?.job?.id ?? null, created: false };
  }

  if (!lead.business) {
    return { jobId: null, created: false };
  }

  const plan = getEffectivePlanId(lead.business);
  if (!canAccessModule(plan, "jobs")) {
    return { jobId: null, created: false };
  }

  const job = await createJobFromLead({
    leadId,
    notes: "Auto-booked from inbound lead",
  });

  return { jobId: job.id, created: true };
}
