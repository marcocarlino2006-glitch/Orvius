import { isAfterHours } from "@/lib/business";
import { estimatedRevenueCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Command TODAY pulse — what Orvius did for this shop since local midnight.
 * Every figure is measured from shop records. Dollar estimates only when the
 * owner set avg ticket. Never invents "recovered revenue."
 */
export type CommandToday = {
  since: string;
  callsAnswered: number;
  /** After-hours / overflow leads captured today (proxy for missed recovered). */
  missedRecovered: number;
  qualifiedLeads: number;
  appointmentsBooked: number;
  urgentOpen: number;
  unresolved: number;
  estimatedJobValueCents: number | null;
  /** Recorded payments settled today — measured CRM money only. */
  collectedCents: number;
  avgTicketCents: number | null;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getCommandToday(params: {
  businessId: string;
  unresolvedCount: number;
}): Promise<CommandToday> {
  const since = startOfToday();
  const businessFilter = { businessId: params.businessId };

  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: {
      hoursJson: true,
      timezone: true,
      avgTicketCents: true,
    },
  });

  const [callsAnswered, leadsToday, jobsToday, urgentOpenLeads, paymentsToday, leadsForAfterHours] =
    await Promise.all([
      prisma.call.count({
        where: { ...businessFilter, createdAt: { gte: since } },
      }),
      prisma.lead.count({
        where: { ...businessFilter, createdAt: { gte: since } },
      }),
      prisma.job.count({
        where: { ...businessFilter, createdAt: { gte: since } },
      }),
      prisma.lead.count({
        where: {
          ...businessFilter,
          status: "new",
          OR: [
            { urgency: { contains: "emergency" } },
            { urgency: { contains: "same" } },
            { urgency: { contains: "urgent" } },
          ],
        },
      }),
      prisma.payment.aggregate({
        where: {
          businessId: params.businessId,
          createdAt: { gte: since },
        },
        _sum: { amountCents: true },
      }),
      prisma.lead.findMany({
        where: { ...businessFilter, createdAt: { gte: since } },
        select: {
          createdAt: true,
          job: { select: { id: true } },
        },
      }),
    ]);

  let missedRecovered = 0;
  if (business) {
    for (const lead of leadsForAfterHours) {
      if (
        isAfterHours(
          lead.createdAt,
          business.hoursJson,
          business.timezone ?? "America/New_York",
        ) &&
        lead.job
      ) {
        missedRecovered += 1;
      }
    }
  }

  // Fallback: if hours unknown, count after-hours proxy as booked-from-today
  // when we cannot classify — prefer zero over theater.
  const estimatedJobValueCents = estimatedRevenueCents(
    business?.avgTicketCents ?? null,
    jobsToday,
  );

  return {
    since: since.toISOString(),
    callsAnswered,
    missedRecovered,
    qualifiedLeads: leadsToday,
    appointmentsBooked: jobsToday,
    urgentOpen: urgentOpenLeads,
    unresolved: params.unresolvedCount,
    estimatedJobValueCents,
    collectedCents: paymentsToday._sum.amountCents ?? 0,
    avgTicketCents: business?.avgTicketCents ?? null,
  };
}

/** Ranked workflow stages for the Command proof strip. */
export type WorkflowStageId =
  | "call"
  | "customer"
  | "qualify"
  | "book"
  | "alert"
  | "followup"
  | "paid";

export type WorkflowStage = {
  id: WorkflowStageId;
  label: string;
  /** measured | waiting | idle */
  state: "measured" | "waiting" | "idle";
  href: string;
  count?: number;
};

export function buildWorkflowStages(input: {
  callsToday: number;
  leadsToday: number;
  jobsToday: number;
  unresolved: number;
  urgentOpen: number;
  collectedCents: number;
  alertsProven?: boolean;
}): WorkflowStage[] {
  return [
    {
      id: "call",
      label: "Call",
      state: input.callsToday > 0 ? "measured" : "idle",
      href: "/dashboard/calls",
      count: input.callsToday || undefined,
    },
    {
      id: "customer",
      label: "Customer",
      state: input.leadsToday > 0 || input.callsToday > 0 ? "measured" : "idle",
      href: "/dashboard/customers",
    },
    {
      id: "qualify",
      label: "Qualify",
      state:
        input.unresolved > 0
          ? "waiting"
          : input.leadsToday > 0
            ? "measured"
            : "idle",
      href: "/dashboard/inbox",
      count: input.unresolved || undefined,
    },
    {
      id: "book",
      label: "Book",
      state: input.jobsToday > 0 ? "measured" : "idle",
      href: "/dashboard/jobs",
      count: input.jobsToday || undefined,
    },
    {
      id: "alert",
      label: "Alert",
      state: input.alertsProven ? "measured" : input.callsToday > 0 ? "waiting" : "idle",
      href: "/dashboard/settings#owner-alerts",
    },
    {
      id: "followup",
      label: "Follow-up",
      state: input.urgentOpen > 0 ? "waiting" : input.jobsToday > 0 ? "measured" : "idle",
      href: "/dashboard/inbox",
      count: input.urgentOpen || undefined,
    },
    {
      id: "paid",
      label: "Paid",
      state: input.collectedCents > 0 ? "measured" : "idle",
      href: "/dashboard/billing",
    },
  ];
}
