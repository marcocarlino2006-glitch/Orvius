import { getShopLineForBusiness } from "@/lib/demo-business";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

/**
 * Poll after the owner dials their new line.
 * A completed call is proof — stamp lineVerifiedAt so setup and UI agree.
 */
export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;

  let business = authResult.business;
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

  /*
    Verify UI and getOwnerSetupStatus must share one predicate. If a completed
    call exists but the stamp was never written (webhook race / partial path),
    write it here so Command unlocks and “Line works” is not a lie.
  */
  if (completedCall && !business.lineVerifiedAt) {
    business = await prisma.business.update({
      where: { id: business.id },
      data: { lineVerifiedAt: completedCall.createdAt },
    });
  }

  const verified = Boolean(business.lineVerifiedAt);

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
