import { NextRequest, NextResponse } from "next/server";
import { isAfterHours } from "@/lib/business";
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
  const tenant = { businessId: business.id };

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
    select: { hoursJson: true, timezone: true },
  });
  const timezone = hours?.timezone ?? "America/New_York";
  const hoursJson = hours?.hoursJson ?? "{}";

  const calls = await prisma.call.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: tenant,
    orderBy: { createdAt: "desc" },
    include: {
      business: { select: { name: true } },
      customer: { select: { id: true, name: true, interactionCount: true } },
      lead: {
        select: {
          id: true,
          name: true,
          serviceType: true,
          urgency: true,
        },
      },
    },
  });

  const hasMore = calls.length > limit;
  const items = hasMore ? calls.slice(0, limit) : calls;

  return NextResponse.json({
    calls: items.map((call) => ({
      id: call.id,
      callerPhone: call.callerPhone,
      status: call.status,
      summary: call.summary,
      durationSec: call.durationSec,
      booked: call.booked,
      createdAt: call.createdAt.toISOString(),
      afterHours: isAfterHours(call.createdAt, hoursJson, timezone),
      business: call.business,
      customer: call.customer,
      lead: call.lead,
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    total: await prisma.call.count({ where: tenant }),
  });
}
