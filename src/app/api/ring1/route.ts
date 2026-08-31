import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  const today = startOfToday();

  const business = await prisma.business.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      ownerPhone: true,
    },
  });

  const [
    callsToday,
    leadsToday,
    newLeads,
    totalCalls,
    totalLeads,
    lastCall,
    recentLeads,
    recentCalls,
  ] = await Promise.all([
    prisma.call.count({ where: { createdAt: { gte: today } } }),
    prisma.lead.count({ where: { createdAt: { gte: today } } }),
    prisma.lead.count({ where: { status: "new" } }),
    prisma.call.count(),
    prisma.lead.count(),
    prisma.call.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, callerPhone: true },
    }),
    prisma.lead.findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
      include: {
        business: { select: { name: true } },
        customer: { select: { id: true, interactionCount: true } },
      },
    }),
    prisma.call.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { name: true, serviceType: true } },
      },
    }),
  ]);

  const line =
    business?.vapiPhoneNumber ??
    business?.twilioPhone ??
    process.env.TWILIO_PHONE_NUMBER?.trim() ??
    null;

  return NextResponse.json({
    business: business
      ? { name: business.name, line, ownerPhone: business.ownerPhone }
      : null,
    metrics: {
      callsToday,
      leadsToday,
      newLeads,
      totalCalls,
      totalLeads,
      answerRate: totalCalls > 0 ? 100 : null,
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
    })),
    recentCalls: recentCalls.map((call) => ({
      id: call.id,
      callerPhone: call.callerPhone,
      status: call.status,
      durationSec: call.durationSec,
      createdAt: call.createdAt.toISOString(),
      leadName: call.lead?.name ?? null,
      serviceType: call.lead?.serviceType ?? null,
    })),
  });
}
