import type { Business } from "@prisma/client";
import type { AttentionItem } from "@/lib/attention-types";
import { groupWorkItems } from "@/lib/command-model";
import { prisma } from "@/lib/prisma";
import {
  composePersonalBrief,
  firstNameFrom,
  learnShopPatterns,
  type PersonalBrief,
} from "@/lib/personal-brief";

const PATTERN_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const PATTERN_MAX_ROWS = 2000;

type BoardJob = {
  scheduledAt: string | null;
  status: string;
  technicianId?: string | null;
  technician?: { name: string } | null;
};

export async function loadPersonalBrief(input: {
  business: Pick<Business, "id" | "hoursJson" | "timezone">;
  ownerName: string | null | undefined;
  since: Date | null;
  now: Date;
  todayStart: Date;
  boardJobs: BoardJob[];
  unassigned: number;
  attention: AttentionItem[];
  totalCalls: number;
  lineVerified: boolean;
  afterHoursNow: boolean;
}): Promise<PersonalBrief> {
  const { business, since, now, todayStart } = input;
  const timezone = business.timezone ?? "America/New_York";
  const businessId = business.id;
  const patternStart = new Date(now.getTime() - PATTERN_WINDOW_MS);

  const [sinceCalls, sinceBooked, completedToday, bookedToday, patternCalls, patternLeads] =
    await Promise.all([
      since ? prisma.call.count({ where: { businessId, createdAt: { gte: since } } }) : 0,
      since ? prisma.job.count({ where: { businessId, createdAt: { gte: since } } }) : 0,
      prisma.job.count({ where: { businessId, status: "completed", completedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { businessId, createdAt: { gte: todayStart } } }),
      prisma.call.findMany({
        where: { businessId, createdAt: { gte: patternStart } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PATTERN_MAX_ROWS,
      }),
      prisma.lead.findMany({
        where: { businessId, createdAt: { gte: patternStart }, status: { not: "spam" } },
        select: { categoryCode: true, customer: { select: { interactionCount: true } } },
        orderBy: { createdAt: "desc" },
        take: PATTERN_MAX_ROWS,
      }),
    ]);

  const scheduled = input.boardJobs
    .filter((job) => job.scheduledAt && job.status !== "completed" && new Date(job.scheduledAt) >= todayStart)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const first = scheduled[0];

  const work = groupWorkItems(input.attention);
  const needsYou = since ? work.filter((item) => new Date(item.createdAt) >= since).length : 0;

  return composePersonalBrief({
    now,
    timezone,
    firstName: firstNameFrom(input.ownerName),
    since: since ? { at: since, calls: sinceCalls, booked: sinceBooked, needsYou } : null,
    today: {
      jobs: input.boardJobs.length,
      unassigned: input.unassigned,
      firstJobAt: first?.scheduledAt ? new Date(first.scheduledAt) : null,
      firstJobTech: firstNameFrom(first?.technician?.name),
      completed: completedToday,
      bookedToday,
    },
    openNeedsYou: work.length,
    totalCalls: input.totalCalls,
    lineVerified: input.lineVerified,
    afterHoursNow: input.afterHoursNow,
    patterns: learnShopPatterns({
      calls: patternCalls,
      leads: patternLeads.map((lead) => ({
        categoryCode: lead.categoryCode,
        returning: (lead.customer?.interactionCount ?? 0) > 1,
      })),
      hoursJson: business.hoursJson,
      timezone,
    }),
  });
}
