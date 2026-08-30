import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    businessCount,
    callCount,
    leadCount,
    customerCount,
    jobCount,
    waitlistCount,
    recentCalls,
    recentLeads,
    recentCustomers,
    recentJobs,
    waitlist,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.call.count(),
    prisma.lead.count(),
    prisma.customer.count(),
    prisma.job.count(),
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
    prisma.job.findMany({
      take: 6,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      include: {
        business: { select: { name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        lead: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true } },
      },
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
    jobCount,
    waitlistCount,
    recentCalls,
    recentLeads,
    recentCustomers,
    recentJobs,
    waitlist,
  });
}
