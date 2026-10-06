import { claimLateCron } from "@/lib/cron-runs";
import { runLineWatchSweep } from "@/lib/line-watch-sweep";
import { logError, logWarn } from "@/lib/logger";

/* One look per server instance a minute; most requests never touch the table. */
const LOOK_EVERY_MS = 60_000;
let lastLook = 0;

/**
 * Run from live webhook traffic after the response is sent. When the
 * scheduler has missed three line-watch runs, the first request to notice
 * claims it and runs it, so lost-call recovery keeps time without GitHub.
 */
export async function backstopLateSweeps(at: string, now = new Date()) {
  if (now.getTime() - lastLook < LOOK_EVERY_MS) return null;
  lastLook = now.getTime();
  try {
    if (!(await claimLateCron("line-watch", now))) return null;
    logWarn("cron.backstop_line_watch", { at });
    return await runLineWatchSweep(`backstop:${at}`);
  } catch (error) {
    logError("cron.backstop_failed", { at, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function resetBackstopThrottleForTests() {
  lastLook = 0;
}
