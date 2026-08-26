import { NextResponse } from "next/server";
import { getConfigStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const config = getConfigStatus();
  const [businessCount, leadCount, callCount] = await Promise.all([
    prisma.business.count(),
    prisma.lead.count(),
    prisma.call.count(),
  ]);

  return NextResponse.json({
    ok: true,
    service: "orvius",
    version: "0.1.0",
    configured: config.ready,
    appUrl: config.appUrl,
    webhookUrl: config.webhookUrl,
    smsWebhookUrl: config.smsWebhookUrl,
    stats: { businessCount, leadCount, callCount },
    config: config.items,
  });
}
