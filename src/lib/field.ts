import { shopDayBounds } from "@/lib/availability";
import { buildDispatchSchedule } from "@/lib/dispatch-schedule";
import { prisma } from "@/lib/prisma";
import { serializeJob } from "@/lib/job";
import { parseSkills } from "@/lib/technician-match";

/** Ring 4 — every shop gets a crew so dispatch is never empty. */
export async function ensureCrew(businessId: string) {
  const existing = await prisma.technician.findMany({
    where: { businessId, isActive: true },
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
    select: { name: true, ownerPhone: true },
  });
  const name = business?.name ? `${business.name} owner` : "Owner";

  /*
    Upsert, because the read above is not a lock. The dispatch page fetches the
    board and the crew at the same moment, and both paths land here: with a
    create, both inserted, and the board drew the owner twice. Against the
    unique on (businessId, name) the second writer's insert collapses into a
    no-op update and both callers get the same row back.
  */
  const owner = await prisma.technician.upsert({
    where: { businessId_name: { businessId, name } },
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
  await ensureCrew(businessId);
  return prisma.technician.findMany({
    where: { businessId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getDispatchBoard(businessId: string, isoDay?: string | null) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { trade: true, servicesJson: true, timezone: true },
  });
  const timezone = business?.timezone ?? "America/New_York";
  const { start, end, day } = shopDayBounds(isoDay, timezone);
  const crew = await listCrew(businessId);

  const jobs = await prisma.job.findMany({
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

  const schedule = buildDispatchSchedule({
    timezone,
    business: business ?? {},
    crew: crew.map((t) => ({ id: t.id, name: t.name, phone: t.phone, skills: parseSkills(t.skillsJson) })),
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
    technician: tech,
    jobs: serialized.filter((job) => job.technicianId === tech.id),
  }));

  return {
    day,
    dayStart: start.toISOString(),
    timezone,
    crew,
    unassigned,
    columns,
    jobCount: jobs.length,
    schedule,
    trade: business?.trade ?? null,
  };
}
