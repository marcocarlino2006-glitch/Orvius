import { after } from "next/server";
import { claimLateCron, markCronRan } from "@/lib/cron-runs";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { runLineWatchSweep } from "@/lib/line-watch-sweep";
import { logError, logWarn } from "@/lib/logger";

/* One look per server instance a minute; most requests never touch the table. */
const LOOK_EVERY_MS = 60_000;
let lastLook = 0;

/**
 * Run from live traffic after the response is sent. When the scheduler has
 * missed three runs of a sweep, the first request to notice claims it and runs
 * it, so alert retries and lost-call recovery keep time without GitHub.
 */
export async function backstopLateSweeps(at: string, now = new Date()) {
  if (now.getTime() - lastLook < LOOK_EVERY_MS) return null;
  lastLook = now.getTime();
  try {
    if (await claimLateCron("alert-drain", now)) {
      logWarn("cron.backstop_alert_drain", { at });
      await markCronRan("alert-drain", now);
      await drainOwnerAlerts({ at: `backstop:${at}` });
    }
    if (!(await claimLateCron("line-watch", now))) return null;
    logWarn("cron.backstop_line_watch", { at });
    return await runLineWatchSweep(`backstop:${at}`);
  } catch (error) {
    logError("cron.backstop_failed", { at, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** After the response, inside a request only: scripts and tests never pick up a sweep by accident. */
export function scheduleBackstop(at: string) {
  try {
    after(() => backstopLateSweeps(at));
  } catch {
    /* no request in scope */
  }
}

export function resetBackstopThrottleForTests() {
  lastLook = 0;
}
