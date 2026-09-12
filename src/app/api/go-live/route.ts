import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEmailConfigured } from "@/lib/email";
import { buildGoLiveReport } from "@/lib/go-live";
import { getBusinessForOwnerWithAutoLine } from "@/lib/provision-business";
import { getBillingReadiness } from "@/lib/stripe";
import { isSmsReady } from "@/lib/twilio-sms";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await getBusinessForOwnerWithAutoLine(email);
  if (!owned) {
    return NextResponse.json({ error: "No shop" }, { status: 404 });
  }
  const { business } = owned;

  const billing = getBillingReadiness();
  let certDone = 0;
  try {
    const parsed = business.founderCertJson
      ? (JSON.parse(business.founderCertJson) as boolean[])
      : [];
    if (Array.isArray(parsed)) certDone = parsed.filter(Boolean).length;
  } catch {
    certDone = 0;
  }

  const hasLine = Boolean(
    business.twilioPhone?.trim() || business.vapiPhoneNumber?.trim(),
  );

  const report = buildGoLiveReport({
    hasDedicatedLine: hasLine,
    lineVerified: Boolean(business.lineVerifiedAt),
    overflowForwardConfirmed: Boolean(business.overflowForwardConfirmedAt),
    ownerPhoneOk: Boolean(business.ownerPhone?.trim()),
    smsConfigured: isSmsReady(),
    emailConfigured: isEmailConfigured(),
    stripeLive: billing.config.secretKey,
    stripePrices: billing.checkoutReady,
    googleAuth: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    baselineSet: Boolean(
      business.avgTicketCents &&
        business.baselineMissedCallsPerWeek != null &&
        business.baselineJobsPerWeek != null,
    ),
    founderCertComplete: certDone >= 5,
  });

  return NextResponse.json({
    ready: report.ready,
    criticalOpen: report.criticalOpen,
    checks: report.checks,
    line: business.twilioPhone || business.vapiPhoneNumber || null,
  });
}
