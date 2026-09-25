import { NextResponse } from "next/server";
import { after } from "next/server";
import { getAttentionQueue } from "@/lib/attention-queue";
import { isPriorityUrgency } from "@/lib/auto-job";
import { listHandled, runAutopilot } from "@/lib/autopilot";
import { shopDayBounds } from "@/lib/availability";
import { isAfterHours } from "@/lib/business";
import { getShopLineForBusiness, isDemoBusiness } from "@/lib/demo-business";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { getDispatchBoard } from "@/lib/field";
import { parseSince } from "@/lib/personal-brief";
import { loadPersonalBrief } from "@/lib/personal-brief-data";
import { prisma } from "@/lib/prisma";
import { getShopHealth } from "@/lib/shop-health";
import { getShopOutcomes } from "@/lib/shop-outcomes";
import { getShiftTimeline } from "@/lib/shift-timeline";
import { requireEntitledSession } from "@/lib/tenant";
import { getWedgeReadiness } from "@/lib/wedge-readiness";
import { isStripeCheckoutConfigured } from "@/lib/stripe";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, session } = authResult;
  const now = new Date();
  const since = parseSince(new URL(request.url).searchParams.get("since"), now);

  const today = shopDayBounds(null, business.timezone ?? "America/New_York").start;
  const businessFilter = { businessId: business.id };
  after(() => runAutopilot(business.id).catch(() => null));
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const healthP = getShopHealth(business.id);

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
    outcomes,
    attention,
    shiftTimeline,
    handled,
    wedge,
    messagesAndWeb,
    qualified,
    bookedInWindow,
    jobsInMotion,
    jobsUnassigned,
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
        job: { select: { id: true, title: true, status: true, scheduledAt: true, technicianId: true } },
      },
    }),
    prisma.lead.findMany({
      where: { ...businessFilter, status: "new" },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true, status: true, scheduledAt: true, technicianId: true } },
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
    getDispatchBoard(business.id, null, business),
    healthP,
    getShopOutcomes(business.id, 7),
    getAttentionQueue(business.id, 12),
    getShiftTimeline(business.id),
    listHandled(business.id),
    healthP.then((health) => getWedgeReadiness(business.id, health)),
    prisma.lead.count({
      where: { ...businessFilter, callId: null, createdAt: { gte: windowStart } },
    }),
    prisma.lead.count({
      where: {
        ...businessFilter,
        createdAt: { gte: windowStart },
        status: { notIn: ["spam", "lost"] },
        serviceType: { not: null },
        phone: { not: null },
      },
    }),
    prisma.lead.count({
      where: {
        ...businessFilter,
        createdAt: { gte: windowStart },
        job: { isNot: null },
      },
    }),
    prisma.job.count({
      where: { ...businessFilter, status: { notIn: ["completed", "cancelled"] } },
    }),
    prisma.job.count({
      where: {
        ...businessFilter,
        status: { notIn: ["completed", "cancelled"] },
        technicianId: null,
      },
    }),
  ]);
  const crew = dispatchBoard.crew;
  const boardJobs = [...dispatchBoard.unassigned, ...dispatchBoard.columns.flatMap((c) => c.jobs)];
  const afterHoursNow = isAfterHours(now, business.hoursJson, business.timezone ?? "America/New_York");
  const personalBrief = await loadPersonalBrief({
    business,
    ownerName: session.user?.name,
    since,
    now,
    todayStart: today,
    boardJobs,
    unassigned: dispatchBoard.unassigned.length,
    attention,
    totalCalls,
    lineVerified: health.lineVerified,
    afterHoursNow,
  }).catch(() => null);
  if (health.stuckPendingAlerts > 0) {
    after(() =>
      drainOwnerAlerts({ at: "ring1.health", businessId: business.id }),
    );
  }

  const priorityLeads = priorityLeadsRaw
    .sort((a, b) => {
      const aUrgent = isPriorityUrgency(a.urgency) ? 0 : 1;
      const bUrgent = isPriorityUrgency(b.urgency) ? 0 : 1;
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
            technicianId: lead.job.technicianId,
          }
        : null,
    }));

  const line = getShopLineForBusiness(business);

  let certDone = 0;
  try {
    const parsed = business.founderCertJson
      ? (JSON.parse(business.founderCertJson) as boolean[])
      : [];
    if (Array.isArray(parsed)) certDone = parsed.filter(Boolean).length;
  } catch {
    certDone = 0;
  }

  const ends = business.pilotEndsAt
    ? new Date(business.pilotEndsAt)
    : new Date(new Date(business.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  const pilotDaysLeft = Math.ceil((ends.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const proofAt = business.lastWeeklyProofAt;
  const proofStale =
    !proofAt || Date.now() - proofAt.getTime() > 7 * 24 * 60 * 60 * 1000;

  return NextResponse.json({
    business: {
      name: business.name,
      line,
      ownerPhone: business.ownerPhone,
      billingStatus: business.billingStatus,
      pilotEndsAt: business.pilotEndsAt?.toISOString() ?? null,
      depositEnabled: business.depositEnabled,
      referenceImplementation: isDemoBusiness(business),
    },
    coverage: {
      afterHoursNow,
      timezone: business.timezone ?? null,
      forwardConfirmed: business.overflowForwardConfirmedAt != null,
    },
    gates: {
      certDone,
      certTotal: 5,
      certIncomplete: certDone < 5,
      economicsReady: outcomes.economicsReady,
      proofStale,
      pilotDaysLeft,
      checkoutReady: isStripeCheckoutConfigured(),
    },
    metrics: {
      callsToday,
      leadsToday,
      newLeads,
      totalCalls,
      totalLeads,
      leadBookingRate: outcomes.bookingRate,
      lastCallAt: lastCall?.createdAt.toISOString() ?? null,
      lastCaller: lastCall?.callerPhone ?? null,
    },
    outcomes,
    commandCounts: {
      windowDays: outcomes.windowDays,
      calls: outcomes.calls,
      messagesAndWeb,
      qualified,
      booked: bookedInWindow,
      jobsInMotion,
      jobsUnassigned,
      avgTicketSet: Boolean(business.avgTicketCents),
    },
    attention,
    handled,
    shiftTimeline,
    lastWeeklyProofAt: business.lastWeeklyProofAt?.toISOString() ?? null,
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
      jobs: [...boardJobs].sort(
        (a, b) => {
          if (!a.scheduledAt && !b.scheduledAt) return 0;
          if (!a.scheduledAt) return 1;
          if (!b.scheduledAt) return -1;
          return a.scheduledAt.localeCompare(b.scheduledAt);
        },
      ),
    },
    technicians: crew.map((tech) => ({ id: tech.id, name: tech.name })),
    health,
    wedge,
    personalBrief,
  });
}
