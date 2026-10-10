import { shopDayBounds } from "@/lib/availability";
import { buildDispatchSchedule } from "@/lib/dispatch-schedule";
import { prisma } from "@/lib/prisma";
import { serializeJob } from "@/lib/job";
import { publicTechnician } from "@/lib/tech-app-link";
import { parseSkills } from "@/lib/technician-match";

/** Ring 4 — every shop gets a crew so dispatch is never empty. */
export async function ensureCrew(businessId: string) {
  const existing = await prisma.technician.findMany({
    where: { businessId, isActive: true },
    omit: { appToken: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing.length) return existing;

  /*
    Asked of the whole table, not just the active rows. An owner who takes
    themselves off the crew should stay off it; keying the seed on active rows
    alone meant re-creating the record they had just removed on the next load.
  */
  const seeded = await prisma.technician.findFirst({
    where: { businessId },
    select: { id: true },
  });
  if (seeded) return existing;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerPhone: true },
  });
  const name = "Owner";

  /*
    Upsert, because the read above is not a lock. The dispatch page fetches the
    board and the crew at the same moment, and both paths land here: with a
    create, both inserted, and the board drew the owner twice. Against the
    unique on (businessId, name) the second writer's insert collapses into a
    no-op update and both callers get the same row back.
  */
  const owner = await prisma.technician.upsert({
    where: { businessId_name: { businessId, name } },
    omit: { appToken: true },
    update: {},
    create: {
      businessId,
      name,
      phone: business?.ownerPhone,
      role: "owner",
    },
  });

  return [owner];
}

export async function listCrew(businessId: string) {
  return ensureCrew(businessId);
}

type BoardBusiness = { trade: string | null; servicesJson: string | null; timezone: string | null };

export async function getDispatchBoard(
  businessId: string,
  isoDay?: string | null,
  known?: BoardBusiness,
) {
  const crewP = listCrew(businessId);
  const business =
    known ??
    (await prisma.business.findUnique({
      where: { id: businessId },
      select: { trade: true, servicesJson: true, jobLengthsJson: true, timezone: true },
    }));
  const timezone = business?.timezone ?? "America/New_York";
  const { start, end, day } = shopDayBounds(isoDay, timezone);

  const jobsP = prisma.job.findMany({
    where: {
      businessId,
      status: { not: "cancelled" },
      OR: [
        { scheduledAt: { gte: start, lt: end } },
        { scheduledAt: null, status: { not: "completed" } },
      ],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      lead: { select: { id: true, name: true, phone: true } },
      technician: { select: { id: true, name: true, phone: true } },
    },
  });
  const timeOffP = prisma.technicianTimeOff.findMany({
    where: { businessId, endsAt: { gt: start } },
    orderBy: { startsAt: "asc" },
    select: { id: true, technicianId: true, startsAt: true, endsAt: true, reason: true },
  });
  const [crew, jobs, timeOff] = await Promise.all([crewP, jobsP, timeOffP]);
  const offFor = (techId: string) => timeOff.filter((t) => t.technicianId === techId);

  const schedule = buildDispatchSchedule({
    timezone,
    business: business ?? {},
    crew: crew.map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
      skills: parseSkills(t.skillsJson),
      hoursJson: t.hoursJson,
      timeOff: offFor(t.id)
        .filter((o) => o.startsAt < end)
        .map((o) => ({ start: o.startsAt, end: o.endsAt, reason: o.reason })),
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      scheduledAt: j.scheduledAt,
      durationMin: j.durationMin,
      technicianId: j.technicianId,
      serviceType: j.serviceType,
      notes: j.notes,
      urgency: j.urgency,
      address: j.address,
      postalCode: j.postalCode,
      customerName: j.customer?.name ?? j.lead?.name ?? null,
    })),
    dayStart: start,
  });

  const serialized = jobs.map(serializeJob);
  const unassigned = serialized.filter((job) => !job.technicianId);
  const columns = crew.map((tech) => ({
    technician: publicTechnician(tech),
    jobs: serialized.filter((job) => job.technicianId === tech.id),
  }));

  return {
    day,
    today: shopDayBounds(null, timezone).day,
    dayStart: start.toISOString(),
    timezone,
    crew: crew.map((t) => ({
      ...publicTechnician(t),
      timeOff: offFor(t.id).map((o) => ({
        id: o.id,
        startsAt: o.startsAt.toISOString(),
        endsAt: o.endsAt.toISOString(),
        reason: o.reason,
      })),
    })),
    unassigned,
    columns,
    jobCount: jobs.length,
    schedule,
    trade: business?.trade ?? null,
  };
}

/** Seven shop days starting Monday of the week holding `isoDay`. */
export function weekDays(isoDay: string | null | undefined, timezone: string): string[] {
  const { day } = shopDayBounds(isoDay, timezone);
  const [y, m, d] = day.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * A week of dispatch: each day is the same schedule the day board draws
 * (lanes, who is off, conflicts, recommendations), built from one read of the
 * week's jobs and time off.
 */
export async function getDispatchWeek(businessId: string, isoDay?: string | null) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { trade: true, servicesJson: true, jobLengthsJson: true, timezone: true },
  });
  const timezone = business?.timezone ?? "America/New_York";
  const days = weekDays(isoDay, timezone);
  const bounds = days.map((d) => shopDayBounds(d, timezone));
  const start = bounds[0]!.start;
  const end = bounds[6]!.end;

  const [crew, jobs, timeOff] = await Promise.all([
    listCrew(businessId),
    prisma.job.findMany({
      where: { businessId, status: { not: "cancelled" }, scheduledAt: { gte: start, lt: end } },
      orderBy: { scheduledAt: "asc" },
      include: {
        customer: { select: { name: true } },
        lead: { select: { name: true } },
      },
    }),
    prisma.technicianTimeOff.findMany({
      where: { businessId, endsAt: { gt: start }, startsAt: { lt: end } },
      select: { technicianId: true, startsAt: true, endsAt: true, reason: true },
    }),
  ]);

  const crewInput = crew.map((t) => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    skills: parseSkills(t.skillsJson),
    hoursJson: t.hoursJson,
    timeOff: timeOff
      .filter((o) => o.technicianId === t.id)
      .map((o) => ({ start: o.startsAt, end: o.endsAt, reason: o.reason })),
  }));

  return {
    days: days.map((day, i) => {
      const { start: dayStart, end: dayEnd } = bounds[i]!;
      const schedule = buildDispatchSchedule({
        timezone,
        business: business ?? {},
        crew: crewInput,
        jobs: jobs
          .filter((j) => j.scheduledAt && j.scheduledAt >= dayStart && j.scheduledAt < dayEnd)
          .map((j) => ({
            id: j.id,
            title: j.title,
            status: j.status,
            scheduledAt: j.scheduledAt,
            durationMin: j.durationMin,
            technicianId: j.technicianId,
            serviceType: j.serviceType,
            notes: j.notes,
            urgency: j.urgency,
            address: j.address,
            postalCode: j.postalCode,
            customerName: j.customer?.name ?? j.lead?.name ?? null,
          })),
        dayStart,
      });
      return { day, schedule };
    }),
    today: shopDayBounds(null, timezone).day,
    timezone,
    crew: crew.map((t) => ({ id: t.id, name: t.name })),
  };
}
