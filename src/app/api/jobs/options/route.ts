import { NextResponse } from "next/server";
import { safeTimezone } from "@/lib/availability";
import { bookingServices } from "@/lib/online-booking";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const technicians = await prisma.technician.findMany({
    where: { businessId: business.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    services: bookingServices(business),
    technicians,
    timezone: safeTimezone(business.timezone),
  });
}
