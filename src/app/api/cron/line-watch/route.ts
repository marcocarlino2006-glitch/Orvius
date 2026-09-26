import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { watchAllLines } from "@/lib/line-watch";
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
  return NextResponse.json({ ok: true, ...(await watchAllLines()) });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
