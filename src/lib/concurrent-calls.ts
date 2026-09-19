/**
 * P6 — line busy / concurrent live calls.
 * Pure helpers so the board can answer without inventing a second phone line.
 */

import type { AttentionImpact } from "@/lib/attention-types";

export function concurrentCallsImpact(
  liveCount: number,
  afterHours: boolean,
): AttentionImpact | null {
  if (liveCount >= 2) return "critical";
  if (liveCount === 1) return afterHours ? "high" : "med";
  return null;
}

export function concurrentCallsRecommendedAction(
  liveCount: number,
  overflowOk: boolean,
): string {
  if (liveCount >= 2) return overflowOk ? "Open calls" : "Confirm overflow";
  if (liveCount === 1) return "Open call";
  return "Open calls";
}
