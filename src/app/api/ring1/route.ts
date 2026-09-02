import { NextResponse } from "next/server";
import { isAutoBookUrgency } from "@/lib/auto-job";
import { getShopLineForBusiness } from "@/lib/demo-business";
import { getDispatchBoard } from "@/lib/field";
import { prisma } from "@/lib/prisma";
import { getShopHealth } from "@/lib/shop-health";
import { requireBusinessSession } from "@/lib/tenant";
import { getWedgeReadiness } from "@/lib/wedge-readiness";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const today = startOfToday();
  const businessFilter = { businessId: business.id };

  const [
    callsToday,
    leadsToday,
    newLeads,
    totalCalls,
    totalLeads,
    lastCall,
    recentLeads,
    priorityLeadsRaw,
    recentCalls,
    dispatchBoard,
    health,
  ] = await Promise.all([
    prisma.call.count({ where: { ...businessFilter, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { ...businessFilter, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { ...businessFilter, status: "new" } }),
    prisma.call.count({ where: businessFilter }),
    prisma.lead.count({ where: businessFilter }),
    prisma.call.findFirst({
      where: businessFilter,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, callerPhone: true },
    }),
    prisma.lead.findMany({
      where: businessFilter,
      take: 4,
      orderBy: { createdAt: "desc" },
      include: {
        business: { select: { name: true } },
        customer: { select: { id: true, interactionCount: true } },
        job: { select: { id: true, title: true, status: true, scheduledAt: true } },
      },
    }),
    prisma.lead.findMany({
      where: { ...businessFilter, status: "new" },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true, status: true, scheduledAt: true } },
      },
    }),
    prisma.call.findMany({
      where: businessFilter,
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { name: true, serviceType: true } },
      },
    }),
    getDispatchBoard(business.id),
    getShopHealth(business.id),
  ]);

  const wedge = await getWedgeReadiness(business.id, health);

  const priorityLeads = priorityLeadsRaw
    .sort((a, b) => {
      const aUrgent = isAutoBookUrgency(a.urgency) ? 0 : 1;
      const bUrgent = isAutoBookUrgency(b.urgency) ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 3)
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
      job: lead.job
        ? {
            id: lead.job.id,
            title: lead.job.title,
            status: lead.job.status,
            scheduledAt: lead.job.scheduledAt?.toISOString() ?? null,
          }
        : null,
    }));

  const line = getShopLineForBusiness(business);

  return NextResponse.json({
    business: {
      name: business.name,
      line,
      ownerPhone: business.ownerPhone,
    },
    metrics: {
      callsToday,
      leadsToday,
      newLeads,
      totalCalls,
      totalLeads,
      answerRate: null,
      lastCallAt: lastCall?.createdAt.toISOString() ?? null,
      lastCaller: lastCall?.callerPhone ?? null,
    },
    recentLeads: recentLeads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
      business: lead.business,
      returning: (lead.customer?.interactionCount ?? 0) > 1,
      booked: Boolean(lead.job),
      jobId: lead.job?.id ?? null,
    })),
    priorityLeads,
    recentCalls: recentCalls.map((call) => ({
      id: call.id,
      callerPhone: call.callerPhone,
      status: call.status,
      durationSec: call.durationSec,
      createdAt: call.createdAt.toISOString(),
      leadName: call.lead?.name ?? null,
      serviceType: call.lead?.serviceType ?? null,
    })),
    dispatchToday: {
      jobCount: dispatchBoard.jobCount,
      unassigned: dispatchBoard.unassigned.length,
      jobs: [...dispatchBoard.unassigned, ...dispatchBoard.columns.flatMap((c) => c.jobs)].sort(
        (a, b) => {
          if (!a.scheduledAt && !b.scheduledAt) return 0;
          if (!a.scheduledAt) return 1;
          if (!b.scheduledAt) return -1;
          return a.scheduledAt.localeCompare(b.scheduledAt);
        },
      ),
    },
    health,
    wedge,
  });
}
