import { prisma } from "@/lib/prisma";

/** Audit actions auto-book writes when it deliberately does not create a job. */
const HOLD_ACTIONS = ["lead.held", "lead.follow_up", "lead.answered", "lead.escalated"];

/**
 * Why each lead was not booked, as auto-book recorded it at the time.
 * A lead with a recorded hold was not booked on purpose; a qualified lead with
 * none is the one where booking never ran or failed.
 */
export async function holdDecisionsByLead(
  businessId: string,
  leadIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (leadIds.length === 0) return out;
  const rows = await prisma.auditEvent.findMany({
    where: {
      businessId,
      leadId: { in: leadIds },
      OR: [
        { action: { in: HOLD_ACTIONS } },
        { action: "service_area.checked", summary: { startsWith: "Outside" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { leadId: true, summary: true },
  });
  for (const row of rows) if (row.leadId) out.set(row.leadId, row.summary);
  return out;
}
