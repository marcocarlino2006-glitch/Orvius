import { isAfterHours } from "@/lib/business";
import { estimatedRevenueCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export type ShopOutcomes = {
  windowDays: number;
  since: string;
  calls: number;
  leads: number;
  jobsBooked: number;
  bookingRate: number | null;
  afterHoursLeads: number;
  emergenciesBooked: number;
  unassignedJobs: number;
  activeTechnicians: number;
  jobsPerTech: number | null;
  avgTicketCents: number | null;
  estimatedPipelineCents: number | null;
  estimatedLeadValueCents: number | null;
};

/**
 * Outcome pulse from existing shop data.
 * Dollar estimates only when avgTicketCents is set — never invented.
 */
export async function getShopOutcomes(
  businessId: string,
  windowDays = 7,
): Promise<ShopOutcomes> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  since.setHours(0, 0, 0, 0);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { hoursJson: true, timezone: true, avgTicketCents: true },
  });

  const [calls, leads, jobsBooked, unassignedJobs, activeTechnicians, emergencyLeads] =
    await Promise.all([
      prisma.call.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      prisma.lead.findMany({
        where: { businessId, createdAt: { gte: since } },
        select: {
          id: true,
          createdAt: true,
          urgency: true,
          job: { select: { id: true } },
        },
      }),
      prisma.job.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      prisma.job.count({
        where: {
          businessId,
          technicianId: null,
          status: { in: ["scheduled", "confirmed", "en_route"] },
        },
      }),
      prisma.technician.count({
        where: { businessId, isActive: true },
      }),
      prisma.lead.count({
        where: {
          businessId,
          createdAt: { gte: since },
          urgency: { contains: "emergency" },
          job: { isNot: null },
        },
      }),
    ]);

  const leadCount = leads.length;
  const bookedFromLeads = leads.filter((l) => l.job).length;
  const afterHoursLeads = leads.filter((lead) =>
    isAfterHours(
      lead.createdAt,
      business?.hoursJson ?? "{}",
      business?.timezone ?? "America/New_York",
    ),
  ).length;

  const bookingRate =
    leadCount > 0 ? Math.round((bookedFromLeads / leadCount) * 100) : null;
  const jobsPerTech =
    activeTechnicians > 0
      ? Math.round((jobsBooked / activeTechnicians) * 10) / 10
      : null;

  const avgTicketCents = business?.avgTicketCents ?? null;

  return {
    windowDays,
    since: since.toISOString(),
    calls,
    leads: leadCount,
    jobsBooked,
    bookingRate,
    afterHoursLeads,
    emergenciesBooked: emergencyLeads,
    unassignedJobs,
    activeTechnicians,
    jobsPerTech,
    avgTicketCents,
    estimatedPipelineCents: estimatedRevenueCents(avgTicketCents, jobsBooked),
    estimatedLeadValueCents: estimatedRevenueCents(avgTicketCents, leadCount),
  };
}
