import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";
import { scheduledTargetRefusal } from "@/lib/scheduled-target";
import { syncLiveAssistants } from "@/lib/sync-live-assistants";

/*
  Dispatch-only, from .github/workflows/assistant-sync.yml. Rewrites each live
  shop's receptionist to the words this deployment serves. It does not bill,
  suspend a line, text anyone, claim the daily sweep, or stamp a heartbeat —
  a missed dispatch is not an outage. The daily sweep still catches a shop
  that had no call.
*/
export const maxDuration = 60;

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
  const after = new URL(request.url).searchParams.get("after");
  if (after && !/^[a-z0-9]+$/i.test(after)) {
    return NextResponse.json({ error: "bad cursor" }, { status: 400 });
  }
  const result = await syncLiveAssistants({ after });
  return NextResponse.json({ ok: result.done, ...result });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
