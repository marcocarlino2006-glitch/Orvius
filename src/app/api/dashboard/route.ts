import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [businessCount, callCount, leadCount, recentCalls, recentLeads] =
    await Promise.all([
      prisma.business.count(),
      prisma.call.count(),
      prisma.lead.count(),
      prisma.call.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { business: { select: { name: true } } },
      }),
      prisma.lead.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { business: { select: { name: true } } },
      }),
    ]);

  return NextResponse.json({
    businessCount,
    callCount,
    leadCount,
    recentCalls,
    recentLeads,
  });
}
