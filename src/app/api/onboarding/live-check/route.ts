import { NextResponse } from "next/server";
import { activationChecklist, activationSummary } from "@/lib/activation";
import { latestForwardTest } from "@/lib/forward-test";
import { connectionHealth } from "@/lib/number-connection";
import { getShopLine } from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import { isSetupSandbox, permissionLevelFor } from "@/lib/setup-flow";
import { getConnectStatus, isConnectConfigured } from "@/lib/stripe-connect";
import { requireEntitledSession } from "@/lib/tenant";
import { textingEligibility } from "@/lib/sms-eligibility";
import { isDemoBusiness } from "@/lib/demo-business";

/** After go-live: what is on, proven by real events, and the one next thing for each item that isn't. */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const b = auth.business;

  const realShop = b.environment === "production" && !isSetupSandbox(b) && !isDemoBusiness(b);
  const [latestAlert, transferred, lastTest, texting, firstDone] = await Promise.all([
    prisma.ownerNotification.findFirst({
      where: { businessId: b.id, channel: { in: ["sms", "email"] } },
      orderBy: { createdAt: "desc" },
      select: { channel: true, status: true, deliveryStatus: true, createdAt: true },
    }),
    b.transferPhone
      ? prisma.call.findFirst({
          where: { businessId: b.id, endedReason: "assistant-forwarded-call", createdAt: { gte: b.createdAt } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null,
    latestForwardTest(b.id),
    textingEligibility(b.id),
    realShop
      ? prisma.job.findFirst({
          where: { businessId: b.id, leadId: { not: null }, status: "completed", completedAt: { not: null }, resolutionCode: { not: null } },
          orderBy: { completedAt: "asc" },
          select: { title: true, completedAt: true },
        })
      : null,
  ]);

  const items = activationChecklist({
    lineVerifiedAt: b.lineVerifiedAt,
    ownerPhone: b.ownerPhone,
    ownerEmail: b.ownerEmail,
    ownerSmsOptOutAt: b.ownerSmsOptOutAt,
    latestAlert: latestAlert
      ? { channel: latestAlert.channel, status: latestAlert.status, deliveryStatus: latestAlert.deliveryStatus, at: latestAlert.createdAt }
      : null,
    transferPhone: b.transferPhone,
    transferProvenAt: transferred?.createdAt ?? null,
    connection: connectionHealth({
      testMode: isSetupSandbox(b),
      line: getShopLine(b),
      provenAt: b.overflowProvedAt,
      lastTest: lastTest ? { state: lastTest.state, title: lastTest.title ?? "", at: lastTest.startedAt } : null,
    }),
    level: permissionLevelFor(b),
    payments: isConnectConfigured() ? getConnectStatus(b).state : null,
    texting,
    firstOutcome: firstDone?.completedAt ? { at: firstDone.completedAt, title: firstDone.title } : null,
  });

  return NextResponse.json({ items, summary: activationSummary(items) });
}
