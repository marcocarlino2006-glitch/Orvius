import { createJobFromLead } from "@/lib/job";
import { prisma } from "@/lib/prisma";

/** Emergency and same-day leads become jobs automatically — the OS handoff. */
export function isAutoBookUrgency(urgency?: string | null): boolean {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  return (
    key.includes("emergency") ||
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  );
}

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

  if (!isAutoBookUrgency(lead.urgency)) {
    return { jobId: null, created: false };
  }

  const job = await createJobFromLead({
    leadId,
    notes: "Auto-booked — emergency or same-day urgency",
  });

  return { jobId: job.id, created: true };
}
