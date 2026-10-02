import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { logWarn } from "@/lib/logger";

/* Long enough for the after-response send to finish on its own. */
export const CONFIRM_SWEEP_GRACE_MS = 5 * 60 * 1000;
/* Past this the customer has either called back or the owner has handled it. */
export const CONFIRM_SWEEP_WINDOW_MS = 6 * 60 * 60 * 1000;

type ConfirmFn = (jobId: string, options: { firstOnly: true }) => Promise<{ sent: boolean; reason?: string }>;

/**
 * A booking texts the customer after the webhook has answered. If the function
 * dies in between, nothing records the outcome and the caller never hears back.
 * The missing `job:<id>:confirmation` audit row is the sign; this resends once.
 */
export async function retryLostConfirmations(
  options: { now?: Date; limit?: number; confirm?: ConfirmFn } = {},
) {
  const now = options.now ?? new Date();
  const confirm = options.confirm ?? sendCustomerConfirmSms;
  const tally = { checked: 0, sent: 0, skipped: 0 };

  const candidates = await prisma.job.findMany({
    where: {
      leadId: { not: null },
      status: "scheduled",
      customerConfirmedAt: null,
      customerConfirmSentAt: null,
      scheduledAt: { gt: now },
      createdAt: {
        gt: new Date(now.getTime() - CONFIRM_SWEEP_WINDOW_MS),
        lt: new Date(now.getTime() - CONFIRM_SWEEP_GRACE_MS),
      },
      business: { isActive: true, environment: { not: "test" } },
    },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 50,
    select: { id: true, businessId: true, leadId: true, customerId: true },
  });
  if (!candidates.length) return tally;

  const recorded = await prisma.auditEvent.findMany({
    where: {
      idempotencyKey: { in: candidates.map((job) => `job:${job.id}:confirmation`) },
    },
    select: { idempotencyKey: true },
  });
  const done = new Set(recorded.map((row) => row.idempotencyKey));

  for (const job of candidates) {
    if (done.has(`job:${job.id}:confirmation`)) continue;
    tally.checked += 1;
    try {
      const result = await confirm(job.id, { firstOnly: true });
      if (result.sent) tally.sent += 1;
      else tally.skipped += 1;
      await recordAudit({
        businessId: job.businessId,
        entityType: "job",
        entityId: job.id,
        jobId: job.id,
        leadId: job.leadId,
        customerId: job.customerId,
        action: result.sent ? "customer.confirmation_sent" : "customer.confirmation_skipped",
        summary: result.sent
          ? "Texted the customer the proposed window to confirm (retried after a lost send)"
          : `Customer confirmation not sent (${(result.reason ?? "unknown").replace(/_/g, " ")})`,
        detail: { reason: result.reason ?? null, retried: true },
        idempotencyKey: `job:${job.id}:confirmation`,
      });
    } catch (error) {
      tally.skipped += 1;
      logWarn("confirm_sweep.failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return tally;
}
