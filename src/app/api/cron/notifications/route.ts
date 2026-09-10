import { NextRequest, NextResponse } from "next/server";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { verifyAdminRequest } from "@/lib/env";
import { processNotificationQueue } from "@/lib/notifications";
import { isProduction } from "@/lib/runtime";

/*
  Scheduled every minute in vercel.json, which is the only cadence that makes
  the retry ladder mean what it says. Owner alerts back off on 1/5/15/60/240
  minutes, and this drain is the only thing that advances them, so while it ran
  once a day a failed 2am alert sat untouched until 09:00 UTC and exhausting
  five attempts took five days instead of five hours. The shop-health metric
  had already picked a side: it flags any alert pending for more than five
  minutes as stuck, a threshold a daily drain could never meet.

  Running this often means two drains can overlap, so processNotificationQueue
  claims each row under a lease before sending.
*/
export async function GET(request: NextRequest) {
  if (isProduction()) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (cronSecret && bearer !== cronSecret && !verifyAdminRequest(request)) {
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
