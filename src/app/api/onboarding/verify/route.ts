import { getShopLineForBusiness } from "@/lib/demo-business";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;

  const business = authResult.business;
  const line = getShopLineForBusiness(business);

  const [completedCall, recentLead] = await Promise.all([
    prisma.call.findFirst({
      where: { businessId: business.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, callerPhone: true },
    }),
    prisma.lead.findFirst({
      where: {
        businessId: business.id,
        createdAt: { gte: business.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, source: true },
    }),
  ]);

  const verified = Boolean(business.lineVerifiedAt || completedCall);

  return NextResponse.json({
    verified,
    line,
    lineVerifiedAt: business.lineVerifiedAt?.toISOString() ?? null,
    firstCall: completedCall
      ? {
          id: completedCall.id,
          at: completedCall.createdAt.toISOString(),
          callerPhone: completedCall.callerPhone,
        }
      : null,
    firstLead: recentLead
      ? {
          id: recentLead.id,
          name: recentLead.name,
          at: recentLead.createdAt.toISOString(),
          source: recentLead.source,
        }
      : null,
  });
}
