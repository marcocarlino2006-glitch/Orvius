import { NextRequest, NextResponse } from "next/server";
import { isAfterHours } from "@/lib/business";
import { holdDecisionsByLead } from "@/lib/booking-decision";
import { gradeCall, summarizeCallQuality } from "@/lib/call-quality";
import { callOutcome } from "@/lib/call-outcome";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(
    Number(searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = searchParams.get("cursor")?.trim() || null;
  const q = searchParams.get("q")?.trim().slice(0, 80) || null;
  const tenant = { businessId: business.id };
  const digits = q?.replace(/\D/g, "") ?? "";
  const where = q
    ? {
        ...tenant,
        OR: [
          ...(digits.length >= 3 ? [{ callerPhone: { contains: digits.slice(-10) } }] : []),
          { summary: { contains: q } },
          { lead: { is: { name: { contains: q } } } },
          { lead: { is: { serviceType: { contains: q } } } },
          { customer: { is: { name: { contains: q } } } },
        ],
      }
    : tenant;

  /*
    Classified here, not in the browser.

    Whether a call came in after hours is the one number on the Calls page that
    states what the shop is paying for, and it is a property of the shop's own
    hours — a plumber answering until eight and a shop closing at four do not
    share a cutoff. Deriving it client-side from the viewer's clock would get it
    wrong for both of them, and wrong again for an owner checking the board from
    another timezone.
  */
  const hours = await prisma.business.findUnique({
    where: { id: business.id },
    select: { hoursJson: true, timezone: true, closedDatesJson: true, trade: true, servicesJson: true, name: true },
  });
  const timezone = hours?.timezone ?? "America/New_York";
  const hoursJson = hours?.hoursJson ?? "{}";

  const calls = await prisma.call.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: { createdAt: "desc" },
    include: {
      business: { select: { name: true } },
      customer: { select: { id: true, name: true, interactionCount: true, address: true } },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          serviceType: true,
          urgency: true,
          categoryCode: true,
          notes: true,
          status: true,
          job: { select: { id: true } },
        },
      },
    },
  });

  const hasMore = calls.length > limit;
  const items = hasMore ? calls.slice(0, limit) : calls;
  const shop = { trade: hours?.trade, servicesJson: hours?.servicesJson, name: hours?.name };
  const holds = await holdDecisionsByLead(
    business.id,
    items.flatMap((call) => (call.lead && !call.lead.job ? [call.lead.id] : [])),
  );
  const leadIds = items.flatMap((call) => (call.lead ? [call.lead.id] : []));
  const escalated = new Set(
    leadIds.length
      ? (
          await prisma.auditEvent.findMany({
            where: { businessId: business.id, leadId: { in: leadIds }, action: "lead.escalated" },
            select: { leadId: true },
          })
        ).map((e) => e.leadId)
      : [],
  );
  const grades = items.map((call) =>
    gradeCall({
      call,
      lead: call.lead,
      business: shop,
      knownAddress: call.customer?.address,
      holdDecision: call.lead ? holds.get(call.lead.id) : null,
    }),
  );

  return NextResponse.json({
    calls: items.map((call, index) => ({
      id: call.id,
      callerPhone: call.callerPhone,
      status: call.status,
      summary: call.summary,
      durationSec: call.durationSec,
      booked: call.booked,
      createdAt: call.createdAt.toISOString(),
      afterHours: isAfterHours(call.createdAt, hoursJson, timezone, hours?.closedDatesJson),
      outcome: callOutcome({
        status: call.status,
        booked: call.booked,
        durationSec: call.durationSec,
        endedReason: call.endedReason,
        lead: call.lead,
        escalated: call.lead ? escalated.has(call.lead.id) : false,
      }),
      business: call.business,
      customer: call.customer
        ? { id: call.customer.id, name: call.customer.name, interactionCount: call.customer.interactionCount }
        : null,
      lead: call.lead
        ? {
            id: call.lead.id,
            name: call.lead.name,
            serviceType: call.lead.serviceType,
            urgency: call.lead.urgency,
            jobId: call.lead.job?.id ?? null,
          }
        : null,
      quality: {
        score: grades[index].score,
        verdict: grades[index].verdict,
        headline: grades[index].headline,
      },
    })),
    quality: summarizeCallQuality(grades),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    total: await prisma.call.count({ where }),
  });
}
