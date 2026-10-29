import { NextResponse } from "next/server";
import { after } from "next/server";
import { collectAttention } from "@/lib/attention-queue";
import { rollUpByPerson } from "@/lib/attention-rollup";
import { isPriorityUrgency } from "@/lib/auto-job";
import { listHandled, runAutopilot } from "@/lib/autopilot";
import { shopDayBounds } from "@/lib/availability";
import { isAfterHours } from "@/lib/business";
import { closedWeekLine } from "@/lib/closed-week";
import { dayOne } from "@/lib/day-one";
import { getShopLineForBusiness, isDemoBusiness } from "@/lib/demo-business";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { commandCallSummary } from "@/lib/command-call";
import { getCommandFlow, getCommandMoney } from "@/lib/command-depth";
import { getCommandTomorrow } from "@/lib/command-tomorrow";
import { getDispatchBoard } from "@/lib/field";
import { parseSince } from "@/lib/personal-brief";
import { loadPersonalBrief } from "@/lib/personal-brief-data";
import { prisma } from "@/lib/prisma";
import { getShopHealth } from "@/lib/shop-health";
import { getReceptionistWeek } from "@/lib/receptionist-week";
import { getShopOutcomes, type ShopOutcomes } from "@/lib/shop-outcomes";
import { logError } from "@/lib/logger";
import { degradedOutcomes, MONEY_PAUSED_ISSUE } from "@/lib/command-degraded";
import { commandVersion, shopVersion } from "@/lib/shop-version";
import { getShiftTimeline } from "@/lib/shift-timeline";
import { requireBusinessSession } from "@/lib/tenant";
import { isSetupSandbox } from "@/lib/setup-flow";
import { isBillingEntitled } from "@/lib/billing-entitlement";
import { billingLock } from "@/lib/plan-gate";
import { getWedgeReadiness } from "@/lib/wedge-readiness";
import { listWork } from "@/lib/work";
import { isStripeCheckoutConfigured } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";

/** Polling every 30s would otherwise write the shop row every 30s. */
const LAST_SEEN_WRITE_MS = 60_000;

export async function GET(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) {
    // Signed up, not paid yet: the shell renders that state, so it is not a failed request.
    if (authResult.error?.status === 404) return NextResponse.json({ noShop: true });
    return authResult.error;
  }
  const { business, session, role, email, guest } = authResult;
  // A shop whose access ended still reads its own shop; Command says how to reopen it.
  const locked = isBillingEntitled(business) ? null : billingLock(business);
  const now = new Date();
  // A tab that already pinned its anchor sends it; a fresh visit uses the account's last look.
  const sinceParam = new URL(request.url).searchParams.get("since");
  const previousLook = sinceParam ?? business.ownerLastSeenAt?.toISOString() ?? null;
  const since = parseSince(previousLook, now);
  /* A visitor reading the sample must not stamp the shop or send anything. */
  if (!guest && role !== "owner") {
    after(() =>
      prisma.membership
        .updateMany({
          where: { businessId: business.id, email, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - LAST_SEEN_WRITE_MS) } }] },
          data: { lastSeenAt: now },
        })
        .catch(() => null),
    );
  } else if (!guest && (!business.ownerLastSeenAt || now.getTime() - business.ownerLastSeenAt.getTime() > LAST_SEEN_WRITE_MS)) {
    after(() =>
      prisma.business
        .update({ where: { id: business.id }, data: { ownerLastSeenAt: now } })
        .catch(() => null),
    );
  }

  if (!locked && !guest) after(() => runAutopilot(business.id).catch(() => null));

  // The 30s poll mostly finds nothing new; answer that from four indexed reads.
  const versionP = shopVersion(business.id).then((data) => commandVersion(data, now, since));
  const haveVersion = new URL(request.url).searchParams.get("v");
  if (haveVersion && haveVersion === (await versionP)) {
    return NextResponse.json({ unchanged: true, version: haveVersion, sinceUsed: since?.toISOString() ?? null });
  }

  const today = shopDayBounds(null, business.timezone ?? "America/New_York").start;
  const businessFilter = { businessId: business.id };
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const healthP = getShopHealth(business.id);
  const attentionP = collectAttention(business.id, now);

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
    receptionist,
    work,
    awaitingResponse,
    upcomingJobs,
    flow,
    money,
    tomorrow,
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
        lead: {
          select: {
            name: true,
            phone: true,
            serviceType: true,
            urgency: true,
            address: true,
            job: {
              select: {
                id: true,
                title: true,
                status: true,
                scheduledAt: true,
                confirmedAt: true,
                completedAt: true,
                invoices: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, paidAt: true } },
              },
            },
          },
        },
      },
    }),
    getDispatchBoard(business.id, null, business),
    healthP,
    getShopOutcomes(business.id, 7).catch((error: unknown) => {
      logError("ring1.outcomes_failed", { businessId: business.id, error: error instanceof Error ? error.message : "unknown" });
      return null;
    }),
    attentionP.then((rows) => rollUpByPerson(rows).slice(0, 12)),
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
    getReceptionistWeek(business.id, 7, now),
    listWork(business.id, "open", now, { attention: attentionP }),
    prisma.lead.count({ where: { ...businessFilter, status: "new", job: { is: null } } }),
    prisma.job.count({
      where: {
        ...businessFilter,
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    getCommandFlow(business.id, now),
    getCommandMoney(business.id, now).catch((error: unknown) => {
      logError("ring1.money_failed", { businessId: business.id, error: error instanceof Error ? error.message : "unknown" });
      return undefined;
    }),
    getCommandTomorrow(business.id, now).catch(() => null),
  ]);
  const moneyPaused = money === undefined || outcomes === null;
  const outcomesOut: ShopOutcomes = outcomes ?? degradedOutcomes(now);
  if (moneyPaused) work.shopIssues = [MONEY_PAUSED_ISSUE, ...work.shopIssues];
  const crew = dispatchBoard.crew;
  const boardJobs = [...dispatchBoard.unassigned, ...dispatchBoard.columns.flatMap((c) => c.jobs)];
  const afterHoursNow = isAfterHours(now, business.hoursJson, business.timezone ?? "America/New_York", business.closedDatesJson);
  const line = getShopLineForBusiness(business);
  const personalBrief = await loadPersonalBrief({
    business,
    ownerName: session.user?.name,
    since,
    now,
    todayStart: today,
    boardJobs,
    unassigned: dispatchBoard.unassigned.length,
    work,
    totalCalls,
    lineVerified: health.lineVerified,
    hasLine: Boolean(line),
    afterHoursNow,
  }).catch(() => null);
  if (!guest && health.stuckPendingAlerts > 0) {
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

  const connect = getConnectStatus(business);
  const closedRows = await prisma.job.findMany({
    where: {
      businessId: business.id,
      status: "completed",
      completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      finalAmountCents: { gt: 0 },
    },
    select: { businessId: true, categoryCode: true, postalCode: true, finalAmountCents: true },
    take: 200,
  });
  const closedLine = closedWeekLine(closedRows);
  const dayOneOut = dayOne({
    live: isBillingEntitled(business) && business.environment === "production" && !isDemoBusiness(business),
    numberProved: Boolean(line) || business.lineVerifiedAt != null || business.overflowProvedAt != null,
    chargesEnabled: connect.chargesEnabled,
    avgTicketCents: outcomesOut.avgTicketCents,
    jobsBooked: outcomesOut.jobsBooked,
    collectedCents: money?.collectedCents ?? outcomesOut.collectedCents,
    moneyPaused: money === undefined || Boolean(outcomesOut.moneyPaused),
    closed: closedLine,
  });

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
    locked,
    business: {
      name: business.name,
      trade: business.trade,
      line,
      ownerPhone: guest ? null : business.ownerPhone,
      guest,
      billingStatus: business.billingStatus,
      pilotEndsAt: business.pilotEndsAt?.toISOString() ?? null,
      depositEnabled: business.depositEnabled,
      referenceImplementation: isDemoBusiness(business),
      demoWorkspace: business.environment === "demo" && business.slug.startsWith("demo-"),
      sampleFrom: business.createdAt.toISOString(),
      testMode: isSetupSandbox(business),
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
      economicsReady: outcomesOut.economicsReady,
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
      leadBookingRate: outcomesOut.bookingRate,
      lastCallAt: lastCall?.createdAt.toISOString() ?? null,
      lastCaller: lastCall?.callerPhone ?? null,
    },
    outcomes: outcomesOut,
    receptionist,
    commandCounts: {
      windowDays: outcomesOut.windowDays,
      calls: outcomesOut.calls,
      messagesAndWeb,
      qualified,
      booked: bookedInWindow,
      jobsInMotion,
      jobsUnassigned,
      avgTicketSet: Boolean(business.avgTicketCents),
      awaitingResponse,
      upcomingJobs,
    },
    attention,
    work: {
      needsYou: work.needsYou,
      open: work.items.length,
      items: work.items.slice(0, 30),
      approvals: work.approvals,
      shopIssues: work.shopIssues,
    },
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
      replyP50Ms: call.replyP50Ms,
      summary: commandCallSummary(call.summary),
      booked: call.booked,
      endedReason: call.endedReason,
      leadPhone: call.lead?.phone ?? null,
      urgency: call.lead?.urgency ?? null,
      address: call.lead?.address ?? null,
      hasLead: Boolean(call.lead),
      job: call.lead?.job
        ? {
            id: call.lead.job.id,
            title: call.lead.job.title,
            status: call.lead.job.status,
            scheduledAt: call.lead.job.scheduledAt?.toISOString() ?? null,
            confirmedAt: call.lead.job.confirmedAt?.toISOString() ?? null,
            completedAt: call.lead.job.completedAt?.toISOString() ?? null,
            invoiceStatus: call.lead.job.invoices[0]?.status ?? null,
            invoicePaidAt: call.lead.job.invoices[0]?.paidAt?.toISOString() ?? null,
          }
        : null,
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
    flow,
    money,
    dayOne: dayOneOut,
    closedWeek: closedLine,
    tomorrow,
    crewBoard: crewBoard(dispatchBoard, boardJobs),
    technicians: crew.map((tech) => ({ id: tech.id, name: tech.name })),
    health,
    wedge,
    personalBrief,
    /** The anchor this response used, so the tab can keep it for the session. */
    sinceUsed: since?.toISOString() ?? null,
    /** Sent back as `v` on the next poll to skip the rebuild when nothing changed. */
    version: await versionP,
  });
}

type Board = Awaited<ReturnType<typeof getDispatchBoard>>;

/** Today's lanes with each block's real step, so Command can draw where the crew is without a second read. */
function crewBoard(board: Board, jobs: Board["unassigned"]) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const step = (id: string, status: string) => {
    const job = byId.get(id);
    if (status === "completed" || status === "on_site" || status === "en_route") return status;
    if (job?.techAcceptedAt) return "accepted";
    return "waiting_tech";
  };
  const block = (b: { id: string; title: string; status: string; startMin: number; endMin: number; customerName: string | null; urgency: string | null; conflict?: string | null }) => ({
    id: b.id,
    title: b.title,
    customerName: b.customerName,
    startMin: b.startMin,
    endMin: b.endMin,
    status: b.status,
    step: step(b.id, b.status),
    customerConfirmed: Boolean(byId.get(b.id)?.customerConfirmedAt),
    emergency: b.urgency === "emergency",
    conflict: b.conflict ?? null,
  });
  return {
    isToday: board.day === board.today,
    dayStart: board.dayStart,
    window: board.schedule.window,
    lanes: board.schedule.lanes.map((lane) => ({
      technician: { id: lane.technician.id, name: lane.technician.name, phone: lane.technician.phone ?? null },
      availability: lane.availability,
      offAllDay: lane.offAllDay,
      blocks: lane.blocks.map(block),
    })),
    unassigned: board.schedule.unassigned
      .filter((u) => u.startMin != null && u.endMin != null)
      .map((u) => ({ id: u.id, title: u.title, customerName: u.customerName, startMin: u.startMin!, endMin: u.endMin!, emergency: u.urgency === "emergency" })),
  };
}
