import { NextRequest, NextResponse } from "next/server";
import { markCronRan } from "@/lib/cron-runs";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { pageOnErrorBurst } from "@/lib/error-burst";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { sendLifecycleEmails } from "@/lib/lifecycle-email";
import { logWarn } from "@/lib/logger";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { openUnchosenBooking } from "@/lib/scheduling-policy";
import { pageIfSignupClosed } from "@/lib/signup-watch";
import { scheduledTargetRefusal } from "@/lib/scheduled-target";

/*
  Driven every 5 minutes by .github/workflows/alert-drain.yml. Webhooks drain
  the owner-alert ladder on busy lines; this is what moves a retry on a quiet
  line at 3am, which otherwise waited for the daily cron. It also sweeps calls
  whose report was captured but never finished, leads saved without an alert,
  and the setup-recovery, welcome and first-call emails.
*/
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!isUnauthenticatedAccessAllowed()) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    if (!secretsMatch(getBearerToken(request), cronSecret) && !verifyAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const refusal = scheduledTargetRefusal(request.headers);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  }
  await markCronRan("alert-drain");
  await drainOwnerAlerts({ at: "cron.alert_drain" });
  let bookingOpened = 0;
  try {
    bookingOpened = await openUnchosenBooking();
  } catch (error) {
    logWarn("alert_drain.booking_open_failed", { error: error instanceof Error ? error.message : String(error) });
  }
  const errors = await pageOnErrorBurst().catch((error: unknown) => {
    logWarn("alert_drain.error_burst_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  const signup = await pageIfSignupClosed().catch((error: unknown) => {
    logWarn("alert_drain.signup_watch_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  const lifecycle = await sendLifecycleEmails().catch((error: unknown) => {
    logWarn("alert_drain.lifecycle_email_failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  return NextResponse.json({ ok: true, bookingOpened, errors, signup, lifecycle });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
