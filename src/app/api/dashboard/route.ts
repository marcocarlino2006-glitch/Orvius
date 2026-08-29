import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    businessCount,
    callCount,
    leadCount,
    customerCount,
    waitlistCount,
    recentCalls,
    recentLeads,
    recentCustomers,
    waitlist,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.call.count(),
    prisma.lead.count(),
    prisma.customer.count(),
    prisma.waitlistEntry.count(),
    prisma.call.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        business: { select: { name: true } },
        customer: { select: { id: true, name: true, interactionCount: true } },
      },
    }),
    prisma.lead.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        business: { select: { name: true } },
        customer: { select: { id: true, name: true, interactionCount: true } },
      },
    }),
    prisma.customer.findMany({
      take: 6,
      orderBy: { lastSeenAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.waitlistEntry.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    businessCount,
    callCount,
    leadCount,
    customerCount,
    waitlistCount,
    recentCalls,
    recentLeads,
    recentCustomers,
    waitlist,
  });
}
