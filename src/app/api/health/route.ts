import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { getAuthConfigStatus } from "@/lib/auth-env";
import { getConfigStatus } from "@/lib/env";
import { isEmailConfigured } from "@/lib/email";
import { company } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { isProduction } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  const config = getConfigStatus();
  /*
    Readiness is public and the counts are not: how many shops and leads are
    behind the line is something a prospect or competitor should have to ask
    for. And since the public answer carries no counts, it must not pay for
    them — five Turso round trips made the uptime probe take three seconds.
  */
  if (isProduction() && !(await isPrivilegedRequest(request))) {
    return NextResponse.json({
      ok: true,
      service: "orvius",
      configured: config.ready,
      ownerSmsEnabled: config.ownerSmsEnabled,
      twilioPhone: config.twilioPhone,
      appUrl: config.appUrl,
    });
  }
  const authStatus = getAuthConfigStatus();
  let businessCount = 0;
  let leadCount = 0;
  let callCount = 0;
  let jobCount = 0;
  let ownerPhone: string | null = null;

  try {
    const [businesses, leads, calls, jobs, primaryBusiness] = await Promise.all([
      prisma.business.count(),
      prisma.lead.count(),
      prisma.call.count(),
      prisma.job.count(),
      prisma.business.findFirst({
        orderBy: { createdAt: "asc" },
        select: { ownerPhone: true },
      }),
    ]);
    businessCount = businesses;
    leadCount = leads;
    callCount = calls;
    jobCount = jobs;
    ownerPhone = primaryBusiness?.ownerPhone ?? null;
  } catch {
    // DB down — still return config so pre-post can report credentials honestly.
  }

  const twilioPhone = config.twilioPhone;
  const ownerPhoneIsTwilioLine = Boolean(
    ownerPhone && twilioPhone && ownerPhone === twilioPhone,
  );
  const ownerSmsEnabled = config.ownerSmsEnabled;
  const ownerSmsReachable =
    ownerSmsEnabled && Boolean(ownerPhone) && !ownerPhoneIsTwilioLine;

  const stats = { businessCount, leadCount, callCount, jobCount };

  return NextResponse.json({
    ok: true,
    service: "orvius",
    version: "1.0.0",
    configured: config.ready,
    appUrl: config.appUrl,
    webhookUrl: config.webhookUrl,
    smsWebhookUrl: config.smsWebhookUrl,
    twilioPhone,
    ownerSmsEnabled,
    ownerPhoneConfigured: Boolean(ownerPhone),
    ownerPhoneIsTwilioLine,
    ownerSmsReachable,
    emailConfigured: isEmailConfigured(),
    formationConfirmed: Boolean(company.formationStateConfirmed?.trim()),
    formationState: company.formationStateConfirmed,
    stats,
    config: config.items,
    auth: {
      ready: authStatus.ready,
      items: authStatus.items,
      redirectUris: authStatus.redirectUris,
    },
    nextSteps: config.ready
      ? authStatus.ready
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
