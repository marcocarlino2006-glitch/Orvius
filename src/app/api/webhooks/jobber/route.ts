import { NextRequest, NextResponse } from "next/server";
import { handleJobberDisconnect, verifyJobberWebhook } from "@/lib/jobber";
import { logInfo, logWarn } from "@/lib/logger";

type JobberEvent = { topic?: string; accountId?: string };

/** Jobber waits one second and redelivers, so everything here is a quick, repeatable write. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyJobberWebhook(raw, request.headers.get("x-jobber-hmac-sha256"))) {
    logWarn("jobber.webhook_rejected", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: JobberEvent | undefined;
  try {
    event = (JSON.parse(raw) as { data?: { webHookEvent?: JobberEvent } }).data?.webHookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (event?.topic === "APP_DISCONNECT" && event.accountId) {
    const count = await handleJobberDisconnect(event.accountId);
    logInfo("jobber.app_disconnect", { accountId: event.accountId, connections: count });
  }
  return NextResponse.json({ ok: true });
}
