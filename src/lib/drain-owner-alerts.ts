import { logError } from "@/lib/logger";
import { processNotificationQueue } from "@/lib/notifications";

/**
 * Advance the owner-alert retry ladder from a request that is already running.
 *
 * The ladder backs off on 1/5/15/60/240 minutes and the queue drain is the
 * only thing that moves it along, so it has to run about once a minute to
 * mean anything. A Vercel cron cannot do that here: this project deploys on
 * a plan that allows one cron a day, and asking for more is not a slower
 * schedule — it is a build that fails, which has broken deploys three times
 * now.
 *
 * The ladder does not need the scheduler. Every Twilio and Vapi webhook
 * drains whatever is due, so a retry advances within seconds of the next
 * call, text or delivery receipt. That is the same traffic that produced the
 * alert, so the busier the shop the faster the ladder turns, and the daily
 * cron sweeps up whatever went stale while the phone was quiet.
 *
 * processNotificationQueue claims each row under a lease before sending, so
 * overlapping drains are already safe. The in-flight guard only stops a burst
 * of webhooks from opening a dozen redundant ones.
 */
let inFlight: Promise<unknown> | null = null;

export async function drainOwnerAlerts(context: Record<string, unknown> = {}) {
  if (inFlight) return;
  inFlight = processNotificationQueue(10)
    .catch((error) => {
      logError("notifications.request_drain_failed", {
        ...context,
        error: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      inFlight = null;
    });
  await inFlight;
}
