import { NextResponse } from "next/server";
import { shopDayBounds } from "@/lib/availability";
import { normalizePhone } from "@/lib/customer";
import { listCrew } from "@/lib/field";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { publicTechnician } from "@/lib/tech-app-link";
import { requireEntitledSession } from "@/lib/tenant";

/**
 * The crew as Team shows it: what each person can do, when they work, what
 * they have on, and whether a job text to their phone has ever arrived.
 */
export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const now = new Date();
  const crew = await listCrew(business.id);
  const ids = crew.map((t) => t.id);
  const phones = [...new Set(crew.map((t) => normalizePhone(t.phone)).filter((p): p is string => Boolean(p)))];

  const [jobs, timeOff, texts] = await Promise.all([
    prisma.job.findMany({
      where: { businessId: business.id, technicianId: { in: ids }, status: { notIn: ["completed", "cancelled"] } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, scheduledAt: true, status: true, technicianId: true },
      take: 500,
    }),
    prisma.technicianTimeOff.findMany({
      where: { technicianId: { in: ids }, endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: { id: true, technicianId: true, startsAt: true, endsAt: true, reason: true },
    }),
    phones.length
      ? prisma.outboundSms.findMany({
          where: { businessId: business.id, audience: "tech", toNormalized: { in: phones } },
          orderBy: { createdAt: "desc" },
          take: 300,
          select: { toNormalized: true, deliveryStatus: true, createdAt: true },
        })
      : [],
  ]);

  const deliveredTo = new Map<string, Date>();
  const lastTo = new Map<string, { status: string | null; at: Date }>();
  for (const t of texts) {
    if (!lastTo.has(t.toNormalized)) lastTo.set(t.toNormalized, { status: t.deliveryStatus, at: t.createdAt });
    if (t.deliveryStatus === "delivered" && !deliveredTo.has(t.toNormalized)) deliveredTo.set(t.toNormalized, t.createdAt);
  }

  return NextResponse.json({
    timezone: business.timezone ?? "America/New_York",
    today: shopDayBounds(null, business.timezone ?? "America/New_York", now).day,
    trade: business.trade ?? null,
    crew: crew.map((tech) => {
      const mine = jobs.filter((j) => j.technicianId === tech.id);
      const next = mine.find((j) => j.scheduledAt && j.scheduledAt >= now) ?? mine[0] ?? null;
      const phone = normalizePhone(tech.phone);
      const delivered = phone ? deliveredTo.get(phone) ?? null : null;
      const last = phone ? lastTo.get(phone) ?? null : null;
      return {
        ...publicTechnician(tech),
        openJobs: mine.length,
        nextJob: next ? { id: next.id, title: next.title, scheduledAt: next.scheduledAt?.toISOString() ?? null } : null,
        timeOff: timeOff
          .filter((o) => o.technicianId === tech.id)
          .map((o) => ({ id: o.id, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString(), reason: o.reason })),
        destination: !phone
          ? { state: "missing" as const }
          : delivered
            ? { state: "verified" as const, at: delivered.toISOString() }
            : last && (last.status === "failed" || last.status === "undelivered")
              ? { state: "failing" as const, at: last.at.toISOString() }
              : { state: "unverified" as const },
      };
    }),
  });
}
