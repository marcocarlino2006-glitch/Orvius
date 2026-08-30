import { prisma } from "@/lib/prisma";
import { serializeJob } from "@/lib/job";

/** Ring 4 — every shop gets a crew so dispatch is never empty. */
export async function ensureCrew(businessId: string) {
  const existing = await prisma.technician.findMany({
    where: { businessId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing.length) return existing;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, ownerPhone: true },
  });

  const owner = await prisma.technician.create({
    data: {
      businessId,
      name: business?.name ? `${business.name} owner` : "Owner",
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

export function dayBounds(isoDay?: string | null) {
  const base = isoDay ? new Date(`${isoDay}T00:00:00`) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function getDispatchBoard(businessId: string, isoDay?: string | null) {
  const { start, end } = dayBounds(isoDay);
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

  const serialized = jobs.map(serializeJob);
  const unassigned = serialized.filter((job) => !job.technicianId);
  const columns = crew.map((tech) => ({
    technician: tech,
    jobs: serialized.filter((job) => job.technicianId === tech.id),
  }));

  return {
    day: start.toISOString(),
    crew,
    unassigned,
    columns,
    jobCount: jobs.length,
  };
}
