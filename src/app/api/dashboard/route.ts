import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [businessCount, callCount, leadCount, waitlistCount, recentCalls, recentLeads, waitlist] =
    await Promise.all([
      prisma.business.count(),
      prisma.call.count(),
      prisma.lead.count(),
      prisma.waitlistEntry.count(),
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
      prisma.waitlistEntry.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return NextResponse.json({
    businessCount,
    callCount,
    leadCount,
    waitlistCount,
    recentCalls,
    recentLeads,
    waitlist,
  });
}
