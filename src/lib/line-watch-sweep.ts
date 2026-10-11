import { refreshStaleBusyCalendars } from "@/lib/busy-calendar";
import { retryLostConfirmations } from "@/lib/confirm-sweep";
import { markCronRan } from "@/lib/cron-runs";
import { drainJobberSyncs } from "@/lib/jobber";
import { drainHousecallSyncs } from "@/lib/housecall";
import { drainQuickBooksSyncs } from "@/lib/quickbooks";
import { runAutoFollowUps } from "@/lib/lead-follow-up";
import { watchAllLines } from "@/lib/line-watch";
import { logError } from "@/lib/logger";
import { pruneOperationalLogs, purgeExpiredCallContent } from "@/lib/retention";
import { runReviewRequests } from "@/lib/review-requests";
import { runVisitReminders } from "@/lib/service-plans";
import { advancePendingTexting } from "@/lib/shop-texting";
import { sendDueWeeklyTexts } from "@/lib/weekly-report";

/** The 30-minute sweep: lost calls and line health, then everything that should land within the hour. */
export async function runLineWatchSweep(at: string) {
  await markCronRan("line-watch");
  const lines = await watchAllLines();
  const failed = (step: string) => (error: unknown) => {
    logError("cron.step_failed", { at, step, error: error instanceof Error ? error.message : String(error) });
    return null;
  };
  // On the 30-minute schedule: a Jobber retry waits minutes, and a caller hears back hours after calling, not the next day.
  // Retention rides along too: one daily pass cannot keep up once a day's expiring calls outnumber it.
  const [jobber, housecall, quickbooks, followUps, calendars, reviews, planVisits, confirmations, texting, weeklyTexts, retention, prunedLogs] = await Promise.all([
    drainJobberSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("jobber_sync")),
    drainHousecallSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("housecall_sync")),
    drainQuickBooksSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("quickbooks_sync")),
    runAutoFollowUps({ budgetMs: 25_000 }).catch(failed("follow_ups")),
    refreshStaleBusyCalendars({ budgetMs: 20_000 }).catch(failed("busy_calendars")),
    runReviewRequests({ budgetMs: 25_000 }).catch(failed("review_requests")),
    runVisitReminders({ budgetMs: 20_000 }).catch(failed("plan_visits")),
    retryLostConfirmations().catch(failed("lost_confirmations")),
    advancePendingTexting({ budgetMs: 20_000 }).catch(failed("shop_texting")),
    sendDueWeeklyTexts({ budgetMs: 25_000 }).catch(failed("weekly_texts")),
    purgeExpiredCallContent({ budgetMs: 20_000 }).catch(failed("call_content_retention")),
    pruneOperationalLogs({ budgetMs: 10_000 }).catch(failed("log_retention")),
  ]);
  return { ...lines, jobber, housecall, quickbooks, followUps, calendars, reviews, planVisits, confirmations, texting, weeklyTexts, retention, prunedLogs };
}
