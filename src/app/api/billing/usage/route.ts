import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePlanId } from "@/lib/plan-features";
import { buildUsageSnapshot } from "@/lib/plan-usage";
import { getBusinessForOwnerWithAutoLine } from "@/lib/provision-business";

export const dynamic = "force-dynamic";

/** Current-month fair-use snapshot for the signed-in shop. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await getBusinessForOwnerWithAutoLine(email);
  if (!business) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const duration = await prisma.call.aggregate({
    where: {
      businessId: business.id,
      createdAt: { gte: periodStart },
    },
    _sum: { durationSec: true },
    _count: true,
  });

  const ownerSmsUsed = await prisma.call.count({
    where: {
      businessId: business.id,
      createdAt: { gte: periodStart },
      ownerNotifiedAt: { not: null },
    },
  });

  const planId = getEffectivePlanId({
    billingStatus: business.billingStatus,
    billingPlan: business.billingPlan,
    pilotEndsAt: business.pilotEndsAt,
    createdAt: business.createdAt,
  });

  const snapshot = buildUsageSnapshot({
    planId,
    answeredSecondsUsed: duration._sum.durationSec ?? 0,
    ownerSmsUsed,
    now,
  });

  return NextResponse.json({
    planId: snapshot.planId,
    answeredMinutesUsed: snapshot.answeredMinutesUsed,
    answeredMinutesIncluded: snapshot.answeredMinutesIncluded,
    ownerSmsUsed: snapshot.ownerSmsUsed,
    ownerSmsIncluded: snapshot.ownerSmsIncluded,
    answeredMinutesPct: snapshot.answeredMinutesPct,
    ownerSmsPct: snapshot.ownerSmsPct,
    nearLimit: snapshot.nearLimit,
    periodStart: snapshot.periodStart.toISOString(),
    periodEnd: snapshot.periodEnd.toISOString(),
    callCount: duration._count,
  });
}
