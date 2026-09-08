import { NextRequest, NextResponse } from "next/server";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { verifyAdminRequest } from "@/lib/env";
import { processNotificationQueue } from "@/lib/notifications";
import { isProduction } from "@/lib/runtime";

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
