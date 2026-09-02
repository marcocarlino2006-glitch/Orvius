import { createJobFromLead } from "@/lib/job";
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

/** Every qualified lead becomes a job — the OS handoff. Scheduling follows urgency. */
export async function maybeAutoBookLead(leadId: string): Promise<{
  jobId: string | null;
  created: boolean;
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { job: { select: { id: true } } },
  });

  if (!lead?.businessId || lead.job) {
    return { jobId: lead?.job?.id ?? null, created: false };
  }

  const job = await createJobFromLead({
    leadId,
    notes: "Auto-booked from inbound lead",
  });

  return { jobId: job.id, created: true };
}
