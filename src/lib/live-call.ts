/**
 * The assistant ends every call at 10 minutes, so a call still marked live
 * after that lost its end-of-call report. Counting it would show the owner a
 * caller who hung up long ago, and would never clear.
 */
export const LIVE_CALL_WINDOW_MS = 11 * 60_000;

const LIVE_STATUSES = new Set(["in-progress", "ringing", "queued"]);

export function liveCallSince(now: Date | number = Date.now()): Date {
  return new Date(new Date(now).getTime() - LIVE_CALL_WINDOW_MS);
}

export function isLiveCall(status: string, createdAt: Date | string, now: Date | number = Date.now()): boolean {
  if (!LIVE_STATUSES.has(status.trim().toLowerCase())) return false;
  return new Date(createdAt).getTime() >= liveCallSince(now).getTime();
}
