import { NextResponse } from "next/server";
import { getAuthConfigStatus } from "@/lib/auth-env";
import { getConfigStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const config = getConfigStatus();
  const auth = getAuthConfigStatus();
  const [businessCount, leadCount, callCount, jobCount, primaryBusiness] = await Promise.all([
    prisma.business.count(),
    prisma.lead.count(),
    prisma.call.count(),
    prisma.job.count(),
    prisma.business.findFirst({
      orderBy: { createdAt: "asc" },
      select: { ownerPhone: true },
    }),
  ]);

  const twilioPhone = config.twilioPhone;
  const ownerPhone = primaryBusiness?.ownerPhone ?? null;
  const ownerPhoneIsTwilioLine =
    Boolean(ownerPhone && twilioPhone && ownerPhone === twilioPhone);
  const ownerSmsReachable =
    config.ownerSmsEnabled &&
    Boolean(ownerPhone) &&
    !ownerPhoneIsTwilioLine;

  return NextResponse.json({
    ok: true,
    service: "orvius",
    version: "0.1.0",
    configured: config.ready,
    appUrl: config.appUrl,
    webhookUrl: config.webhookUrl,
    smsWebhookUrl: config.smsWebhookUrl,
    twilioPhone: config.twilioPhone,
    ownerSmsEnabled: config.ownerSmsEnabled,
    ownerPhoneConfigured: Boolean(ownerPhone),
    ownerPhoneIsTwilioLine,
    ownerSmsReachable,
    stats: { businessCount, leadCount, callCount, jobCount },
    config: config.items,
    auth: {
      ready: auth.ready,
      items: auth.items,
      redirectUris: auth.redirectUris,
    },
    nextSteps: config.ready
      ? auth.ready
        ? [
            "Run npm run onboard if no business exists",
            "Deploy to Vercel so Vapi webhooks reach production",
            "Attach Twilio number in Vapi dashboard",
            "Place a test call",
          ]
        : [
            "Add AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET in Vercel",
            "Create Google OAuth client with redirect URIs from auth.redirectUris",
            "See docs/AUTH-GOOGLE.md",
            "Redeploy after saving env vars",
          ]
      : [
          "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, VAPI_API_KEY to environment secrets",
          "Run npm run sync:env && npm run setup:check",
          "See docs/LIVE-CALL-SETUP.md",
        ],
  });
}
