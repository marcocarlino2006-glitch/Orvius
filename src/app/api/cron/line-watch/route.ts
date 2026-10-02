import { NextRequest, NextResponse } from "next/server";
import { refreshStaleBusyCalendars } from "@/lib/busy-calendar";
import { retryLostConfirmations } from "@/lib/confirm-sweep";
import { getBearerToken, secretsMatch, verifyAdminRequest } from "@/lib/env";
import { drainJobberSyncs } from "@/lib/jobber";
import { runAutoFollowUps } from "@/lib/lead-follow-up";
import { watchAllLines } from "@/lib/line-watch";
import { logError } from "@/lib/logger";
import { runReviewRequests } from "@/lib/review-requests";
import { isProduction } from "@/lib/runtime";
import { runVisitReminders } from "@/lib/service-plans";

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
  const failed = (step: string) => (error: unknown) => {
    logError("cron.step_failed", { step, error: error instanceof Error ? error.message : String(error) });
    return null;
  };
  // On the 30-minute schedule: a Jobber retry waits minutes, and a caller hears back hours after calling, not the next day.
  const [jobber, followUps, calendars, reviews, planVisits, confirmations] = await Promise.all([
    drainJobberSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("jobber_sync")),
    runAutoFollowUps({ budgetMs: 25_000 }).catch(failed("follow_ups")),
    refreshStaleBusyCalendars({ budgetMs: 20_000 }).catch(failed("busy_calendars")),
    runReviewRequests({ budgetMs: 25_000 }).catch(failed("review_requests")),
    runVisitReminders({ budgetMs: 20_000 }).catch(failed("plan_visits")),
    retryLostConfirmations().catch(failed("lost_confirmations")),
  ]);
  return NextResponse.json({ ok: true, ...lines, jobber, followUps, calendars, reviews, planVisits, confirmations });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
