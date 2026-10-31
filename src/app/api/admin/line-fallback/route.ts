import { NextRequest, NextResponse } from "next/server";

import { isPrivilegedRequest } from "@/lib/admin-access";
import { logError } from "@/lib/logger";
import { lineFallbackReport } from "@/lib/line-fallback-report";
import { privilegedActor, recordPlatformAudit } from "@/lib/platform-audit";

export const dynamic = "force-dynamic";

async function respond(fix: boolean) {
  try {
    return NextResponse.json(await lineFallbackReport({ fix }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("admin.line_fallback_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not read the lines from Twilio. Check the Twilio settings and try again." }, { status: 502 });
  }
}

/** Read-only: which shop lines would give a caller Twilio's error tone if the AI were down. */
export async function GET(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return respond(false);
}

/** Sets the fallback on every line that lacks it, then reads them all back. */
export async function POST(request: NextRequest) {
  if (!(await isPrivilegedRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await recordPlatformAudit(await privilegedActor(request), {
    action: "admin.lines.fallback_set",
    summary: "Set the AI-down fallback on every shop line that lacked it",
  });
  return respond(true);
}
