import { NextResponse } from "next/server";
import { activationChecklist, activationSummary } from "@/lib/activation";
import { latestForwardTest } from "@/lib/forward-test";
import { connectionHealth } from "@/lib/number-connection";
import { getShopLine } from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import { isSetupSandbox, permissionLevelFor } from "@/lib/setup-flow";
import { requireEntitledSession } from "@/lib/tenant";

/** After go-live: what is on, proven by real events, and the one next thing for each item that isn't. */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  const b = auth.business;

  const [latestAlert, transferred, lastTest] = await Promise.all([
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
  });

  return NextResponse.json({ items, summary: activationSummary(items) });
}
