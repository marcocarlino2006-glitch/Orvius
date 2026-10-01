import { NextRequest, NextResponse } from "next/server";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";

/*
  Driven every 5 minutes by .github/workflows/alert-drain.yml. Webhooks drain
  the owner-alert ladder on busy lines; this is what moves a retry on a quiet
  line at 3am, which otherwise waited for the daily cron. It also sweeps calls
  whose report was captured but never finished and leads saved without an alert.
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
  }
  await drainOwnerAlerts({ at: "cron.alert_drain" });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
