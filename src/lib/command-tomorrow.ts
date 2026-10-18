import { shopDayBounds } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import { winBackAudience } from "@/lib/win-back";

export type CommandTomorrow = {
  /** Open jobs on tomorrow's schedule, shop-local. */
  jobCount: number;
  unassigned: number;
  firstJobAt: string | null;
  /** Opted-in customers quiet 6+ months, and the prize at the shop's average ticket. */
  dormantCustomers: number;
  dormantEstimatedCents: number | null;
};

function nextDay(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Command looks forward, not only back: tomorrow's load before it becomes
 * today's fire, and the dormant-customer prize while there is still time
 * to act on it. Counts only — win-back sending stays the owner's tap.
 */
export async function getCommandTomorrow(
  businessId: string,
  now = new Date(),
  client = prisma,
  audience: (id: string, months: number) => Promise<unknown[]> = winBackAudience,
): Promise<CommandTomorrow> {
  const business = await client.business.findUnique({
    where: { id: businessId },
    select: { timezone: true, avgTicketCents: true },
  });
  const timezone = business?.timezone ?? "America/New_York";
  const bounds = shopDayBounds(nextDay(shopDayBounds(null, timezone, now).day), timezone, now);
  const [jobs, dormant] = await Promise.all([
    client.job.findMany({
      where: {
        businessId,
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { technicianId: true, scheduledAt: true },
    }),
    audience(businessId, 6).catch(() => [] as unknown[]),
  ]);
  const first = jobs
    .map((job) => job.scheduledAt)
    .filter((at): at is Date => at != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const avgTicketCents = business?.avgTicketCents ?? null;
  return {
    jobCount: jobs.length,
    unassigned: jobs.filter((job) => !job.technicianId).length,
    firstJobAt: first ? first.toISOString() : null,
    dormantCustomers: dormant.length,
    dormantEstimatedCents: avgTicketCents != null ? dormant.length * avgTicketCents : null,
  };
}
