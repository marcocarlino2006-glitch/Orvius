import { judgeFailures, parseStoredVerdict, type JudgeVerdict } from "@/lib/call-judge";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/*
  Never the reason a call fails to save or a screen fails to load: the table
  arrives after the deploy that writes to it, and a judge's verdict is extra.
*/
export async function saveCallReview(callId: string, businessId: string, verdict: JudgeVerdict | null): Promise<void> {
  if (!verdict) return;
  const data = { businessId, verdictJson: JSON.stringify(verdict), failed: judgeFailures(verdict).length };
  try {
    await prisma.callReview.upsert({ where: { callId }, create: { callId, ...data }, update: data });
  } catch (error) {
    logWarn("call_review.save_failed", { callId, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function loadCallReviews(callIds: string[]): Promise<Map<string, JudgeVerdict>> {
  const out = new Map<string, JudgeVerdict>();
  if (!callIds.length) return out;
  try {
    const rows = await prisma.callReview.findMany({ where: { callId: { in: callIds } }, select: { callId: true, verdictJson: true } });
    for (const row of rows) {
      const verdict = parseStoredVerdict(row.verdictJson);
      if (verdict) out.set(row.callId, verdict);
    }
  } catch {
    /* No table yet: every call is graded without the judge. */
  }
  return out;
}

/** The verdict quotes the transcript, so it goes when the call's words go. */
export async function forgetCallReviews(callIds: string[]): Promise<void> {
  if (!callIds.length) return;
  try {
    await prisma.callReview.deleteMany({ where: { callId: { in: callIds } } });
  } catch (error) {
    logWarn("call_review.forget_failed", { count: callIds.length, error: error instanceof Error ? error.message : String(error) });
  }
}
