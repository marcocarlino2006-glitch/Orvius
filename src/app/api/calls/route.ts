import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(
    Number(searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = searchParams.get("cursor")?.trim() || null;
  const tenant = { businessId: business.id };

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
      business: call.business,
      customer: call.customer,
      lead: call.lead,
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    total: await prisma.call.count({ where: tenant }),
  });
}
