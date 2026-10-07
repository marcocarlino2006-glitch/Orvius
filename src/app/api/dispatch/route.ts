import { NextResponse } from "next/server";
import { getDispatchBoard, getDispatchWeek } from "@/lib/field";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";
import { buildTimesheet, weekBounds } from "@/lib/tech-timesheet";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const url = new URL(request.url);
  const day = url.searchParams.get("day");
  if (url.searchParams.get("view") === "week") {
    return NextResponse.json(await getDispatchWeek(business.id, day));
  }
  if (url.searchParams.get("view") === "hours") {
    const { start, end } = weekBounds(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10));
    const jobs = await prisma.job.findMany({
      where: {
        businessId: business.id,
        technicianId: { not: null },
        OR: [
          { completedAt: { gte: start, lt: end } },
          { onSiteAt: { gte: start, lt: end } },
          { dispatchedAt: { gte: start, lt: end } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        durationMin: true,
        dispatchedAt: true,
        onSiteAt: true,
        completedAt: true,
        technicianId: true,
        technician: { select: { name: true } },
      },
    });
    return NextResponse.json({
      start: start.toISOString(),
      end: end.toISOString(),
      lanes: buildTimesheet(
        jobs.map((job) => ({
          ...job,
          technicianName: job.technician?.name ?? null,
        })),
      ),
    });
  }

  const board = await getDispatchBoard(business.id, day);
  return NextResponse.json({
    business: { id: business.id, name: business.name },
    ...board,
  });
}
