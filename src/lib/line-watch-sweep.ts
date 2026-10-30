import { refreshStaleBusyCalendars } from "@/lib/busy-calendar";
import { refreshStaleFsmSchedules } from "@/lib/fsm-schedule";
import { retryLostConfirmations } from "@/lib/confirm-sweep";
import { sendDueCustomerConfirmationReminders } from "@/lib/customer-confirm";
import { markCronRan } from "@/lib/cron-runs";
import { drainJobberSyncs } from "@/lib/jobber";
import { drainHousecallSyncs } from "@/lib/housecall";
import { drainServiceTitanSyncs } from "@/lib/servicetitan";
import { drainQuickBooksSyncs } from "@/lib/quickbooks";
import { runAutoFollowUps } from "@/lib/lead-follow-up";
import { watchAllLines } from "@/lib/line-watch";
import { logError } from "@/lib/logger";
import { selfTestOneReceptionist } from "@/lib/receptionist-self-test";
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
  const [selfTest, jobber, housecall, servicetitan, quickbooks, followUps, calendars, fsmSchedules, reviews, planVisits, confirmations, confirmReminders, texting, weeklyTexts, retention, prunedLogs] = await Promise.all([
    selfTestOneReceptionist().catch(failed("receptionist_self_test")),
    drainJobberSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("jobber_sync")),
    drainHousecallSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("housecall_sync")),
    drainServiceTitanSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("servicetitan_sync")),
    drainQuickBooksSyncs({ limit: 25, budgetMs: 25_000 }).catch(failed("quickbooks_sync")),
    runAutoFollowUps({ budgetMs: 25_000 }).catch(failed("follow_ups")),
    refreshStaleBusyCalendars({ budgetMs: 20_000 }).catch(failed("busy_calendars")),
    refreshStaleFsmSchedules({ budgetMs: 20_000 }).catch(failed("fsm_schedules")),
    runReviewRequests({ budgetMs: 25_000 }).catch(failed("review_requests")),
    runVisitReminders({ budgetMs: 20_000 }).catch(failed("plan_visits")),
    retryLostConfirmations().catch(failed("lost_confirmations")),
    sendDueCustomerConfirmationReminders(new Date(), 25).catch(failed("customer_confirmations")),
    advancePendingTexting({ budgetMs: 20_000 }).catch(failed("shop_texting")),
    sendDueWeeklyTexts({ budgetMs: 25_000 }).catch(failed("weekly_texts")),
    purgeExpiredCallContent({ budgetMs: 20_000 }).catch(failed("call_content_retention")),
    pruneOperationalLogs({ budgetMs: 10_000 }).catch(failed("log_retention")),
  ]);
  return { ...lines, selfTest, jobber, housecall, servicetitan, quickbooks, followUps, calendars, fsmSchedules, reviews, planVisits, confirmations, confirmReminders, texting, weeklyTexts, retention, prunedLogs };
}
