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
    nextSteps: config.ready
      ? [
          "Run npm run onboard if no business exists",
          "Deploy to Vercel so Vapi webhooks reach production",
          "Attach Twilio number in Vapi dashboard",
          "Place a test call",
        ]
      : [
          "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, VAPI_API_KEY to environment secrets",
          "Run npm run sync:env && npm run setup:check",
          "See docs/LIVE-CALL-SETUP.md",
        ],
  });
}
