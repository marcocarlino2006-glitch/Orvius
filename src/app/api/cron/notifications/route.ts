import { NextRequest, NextResponse } from "next/server";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { logError } from "@/lib/logger";
import { processNotificationQueue } from "@/lib/notifications";
import { isProduction } from "@/lib/runtime";

/*
  The daily sweep, not the thing that makes the retry ladder work.

  Owner alerts back off on 1/5/15/60/240 minutes, so a once-a-day drain can
  never keep up — shop health flags any alert pending five minutes as stuck.
  The obvious answer, scheduling this every minute, is not a schedule on this
  project's Vercel scope, it is a rejected build, and it has taken deploys
  down three times. So the webhooks advance the ladder instead: every call,
  text and delivery receipt drains what is due, which is the same traffic
  that produced the alert. See lib/drain-owner-alerts.ts.

  What is left for a daily run is the case webhooks cannot cover — something
  that fell due while the phone was quiet. Drains overlap, so
  processNotificationQueue claims each row under a lease before sending.
*/
export async function GET(request: NextRequest) {
  if (isProduction()) {
    const cronSecret = process.env.CRON_SECRET?.trim();

    /*
      The guard used to be conditional on the secret existing, so production
      without CRON_SECRET meant no check at all: anyone could drive the queue
      and read back how many alerts a shop had waiting. Refusing instead is
      the only safe reading of a missing secret, and 503 rather than 401 says
      whose fault it is. deploy:check treats the secret as required so this
      cannot quietly stop the drain — Vercel only sends the bearer header when
      CRON_SECRET is set, which is the same condition being checked here.
    */
    if (!cronSecret) {
      logError("cron.secret_missing", {
        detail: "CRON_SECRET is unset in production; refusing to drain",
      });
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }

    if (
      !secretsMatch(getBearerToken(request), cronSecret) &&
      !verifyAdminRequest(request)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [notifications, customerConfirmations] = await Promise.all([
    processNotificationQueue(50),
    sendDueCustomerConfirmationReminders(new Date(), 25),
  ]);
  return NextResponse.json({
    ok: true,
    ...notifications,
    customerConfirmations,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
