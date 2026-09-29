import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { drainJobberSyncs } from "@/lib/jobber";
import { watchAllLines } from "@/lib/line-watch";
import { logError } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";

/*
  Driven every 30 minutes by .github/workflows/line-watch.yml, not Vercel
  cron: a sub-daily Vercel schedule is a rejected build on this project.
*/
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (isProduction()) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    if (!secretsMatch(getBearerToken(request), cronSecret) && !verifyAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const lines = await watchAllLines();
  // Rides the 30-minute schedule so a Jobber retry waits minutes, not a day.
  const jobber = await drainJobberSyncs({ limit: 25, budgetMs: 25_000 }).catch((error) => {
    logError("cron.step_failed", { step: "jobber_sync", error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  return NextResponse.json({ ok: true, ...lines, jobber });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
