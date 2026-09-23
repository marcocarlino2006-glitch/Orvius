/**
 * One review-ask SMS after a successful job outcome — only when the shop
 * saved a real public review URL. Never invent a Google link.
 */

import { sendCustomerSms } from "@/lib/customer-sms";
import type { JobOutcomeCode } from "@/lib/job-outcome";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

const SKIP_OUTCOMES = new Set<JobOutcomeCode>([
  "customer_declined",
  "no_access",
  "referred",
]);

export function isValidPublicReviewUrl(raw: string | null | undefined): boolean {
  const value = raw?.trim() ?? "";
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    // Block obvious placeholders.
    if (/example\.com|localhost|changeme|placeholder/i.test(url.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function sendJobReviewSms(params: {
  jobId: string;
  resolutionCode: JobOutcomeCode;
}): Promise<{ sent: boolean; reason?: string }> {
  if (SKIP_OUTCOMES.has(params.resolutionCode)) {
    return { sent: false, reason: "outcome_skipped" };
  }

  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    include: {
      business: { select: { id: true, name: true, googleReviewUrl: true } },
      customer: { select: { phone: true } },
      lead: { select: { phone: true } },
    },
  });
  if (!job?.business) return { sent: false, reason: "not_found" };
  if (job.reviewSmsSentAt) return { sent: false, reason: "already_sent" };

  const reviewUrl = job.business.googleReviewUrl?.trim() ?? "";
  if (!isValidPublicReviewUrl(reviewUrl)) {
    return { sent: false, reason: "no_review_url" };
  }

  const to = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  if (!to) return { sent: false, reason: "no_phone" };

  const body = withSmsOptOutFooter(
    `${job.business.name}: thanks for choosing us. If we earned it, a quick review helps other neighbors find us:\n${reviewUrl}`,
  );

  try {
    const result = await sendCustomerSms({
      businessId: job.businessId,
      to,
      body,
    });
    if (!result.sent) return result;

    await prisma.job.update({
      where: { id: params.jobId },
      data: { reviewSmsSentAt: new Date() },
    });
    logInfo("job.review_sms_sent", {
      jobId: params.jobId,
      businessId: job.businessId,
      sid: result.sid,
    });
    return { sent: true };
  } catch (error) {
    logWarn("job.review_sms_failed", {
      jobId: params.jobId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}
