import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { isShopDaytime } from "@/lib/lead-follow-up";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * After a finished visit the customer gets one text with the shop's review
 * link. Everyone gets the same link — asking only the happy ones is review
 * gating, which Google and the FTC both prohibit — so the guard is on timing
 * and frequency, never on sentiment.
 */

export const REVIEW_AFTER_MS = 60 * 60_000;
export const REVIEW_UNTIL_MS = 3 * 24 * 60 * 60_000;
/** One ask per customer per season, however many visits they book. */
export const REVIEW_PER_PHONE_GAP_MS = 90 * 24 * 60 * 60_000;

/** Visits that ended without work done are not something to review. */
const NO_REVIEW_OUTCOMES = new Set(["customer_declined", "no_access", "referred"]);

const REVIEW_HOSTS = [
  /(^|\.)google\.(com|[a-z]{2}|com?\.[a-z]{2})$/,
  /(^|\.)g\.page$/,
  /(^|\.)goo\.gl$/,
  /(^|\.)yelp\.com$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)nextdoor\.com$/,
  /(^|\.)angi\.com$/,
  /(^|\.)homeadvisor\.com$/,
  /(^|\.)thumbtack\.com$/,
  /(^|\.)bbb\.org$/,
  /(^|\.)trustpilot\.com$/,
  /(^|\.)zocdoc\.com$/,
  /(^|\.)healthgrades\.com$/,
  /(^|\.)tripadvisor\.(com|[a-z]{2}|com?\.[a-z]{2})$/,
  /(^|\.)houzz\.com$/,
];

export type ReviewUrlCheck = { ok: true; url: string } | { ok: false; error: string };

export function normalizeReviewUrl(raw: string): ReviewUrlCheck {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "That isn't a web address. Paste the link customers use to review you." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Use the https:// review link." };
  if (!REVIEW_HOSTS.some((re) => re.test(url.hostname.toLowerCase()))) {
    return {
      ok: false,
      error: "Use your Google, Yelp, Facebook, Nextdoor, Angi, BBB, Trustpilot or similar review page.",
    };
  }
  return { ok: true, url: url.toString() };
}

function firstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first && /^[\p{L}'-]{2,}$/u.test(first) ? first : null;
}

export function reviewMessage(params: { businessName: string; name: string | null; reviewUrl: string }) {
  const first = firstName(params.name);
  return `${first ? `Hi ${first}, thanks` : "Thanks"} for choosing ${params.businessName}. Would you take a minute to leave us a review? It really helps a small business: ${params.reviewUrl} Reply STOP to opt out.`;
}

export type ReviewJob = {
  status: string;
  completedAt: Date | null;
  resolutionCode: string | null;
  reviewRequestedAt: Date | null;
  phone: string | null;
};

export type ReviewBlock = "already_sent" | "not_completed" | "no_work_done" | "no_phone" | "too_soon" | "too_old";

export function reviewBlock(job: ReviewJob, now: Date): ReviewBlock | null {
  if (job.reviewRequestedAt) return "already_sent";
  if (job.status !== "completed" || !job.completedAt) return "not_completed";
  if (job.resolutionCode && NO_REVIEW_OUTCOMES.has(job.resolutionCode)) return "no_work_done";
  if (!normalizePhone(job.phone ?? "")) return "no_phone";
  const age = now.getTime() - job.completedAt.getTime();
  if (age < REVIEW_AFTER_MS) return "too_soon";
  if (age > REVIEW_UNTIL_MS) return "too_old";
  return null;
}

type SendFn = typeof sendCustomerSms;

export async function sendReviewRequest(params: {
  jobId: string;
  now?: Date;
  send?: SendFn;
}): Promise<{ sent: true } | { sent: false; reason: string }> {
  const now = params.now ?? new Date();
  const send = params.send ?? sendCustomerSms;
  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    select: {
      id: true,
      businessId: true,
      status: true,
      completedAt: true,
      resolutionCode: true,
      reviewRequestedAt: true,
      customerId: true,
      customer: { select: { name: true, phone: true, phoneNormalized: true } },
      lead: { select: { name: true, phone: true } },
      business: { select: { name: true, reviewUrl: true, reviewRequestsOn: true } },
    },
  });
  if (!job) return { sent: false, reason: "not_found" };
  if (!job.business.reviewRequestsOn) return { sent: false, reason: "off" };
  if (!job.business.reviewUrl) return { sent: false, reason: "no_review_url" };

  const phone = job.customer?.phone ?? job.lead?.phone ?? null;
  const block = reviewBlock({ ...job, phone }, now);
  if (block) return { sent: false, reason: block };
  const normalized = normalizePhone(phone)!;

  const recent = await prisma.job.findFirst({
    where: {
      businessId: job.businessId,
      id: { not: job.id },
      reviewRequestedAt: { gte: new Date(now.getTime() - REVIEW_PER_PHONE_GAP_MS) },
      OR: [
        ...(job.customerId ? [{ customerId: job.customerId }] : []),
        { customer: { phoneNormalized: normalized } },
      ],
    },
    select: { id: true },
  });
  if (recent) {
    await prisma.job.updateMany({ where: { id: job.id, reviewRequestedAt: null }, data: { reviewRequestedAt: now } });
    return { sent: false, reason: "asked_recently" };
  }

  const claim = await prisma.job.updateMany({
    where: { id: job.id, reviewRequestedAt: null },
    data: { reviewRequestedAt: now },
  });
  if (claim.count === 0) return { sent: false, reason: "already_sent" };

  const result = await send({
    businessId: job.businessId,
    to: normalized,
    body: reviewMessage({
      businessName: job.business.name,
      name: job.customer?.name ?? job.lead?.name ?? null,
      reviewUrl: job.business.reviewUrl,
    }),
  });
  if (!result.sent) {
    if (result.reason === "sms_not_configured") {
      await prisma.job.updateMany({ where: { id: job.id, reviewRequestedAt: now }, data: { reviewRequestedAt: null } });
    }
    logWarn("review_request.not_sent", { jobId: job.id, reason: result.reason });
    return { sent: false, reason: result.reason };
  }

  await recordAudit({
    businessId: job.businessId,
    entityType: "job",
    entityId: job.id,
    jobId: job.id,
    action: "job.review_requested",
    summary: "Review link texted to the customer",
    idempotencyKey: `review:${job.id}`,
  });
  logInfo("review_request.sent", { businessId: job.businessId, jobId: job.id });
  return { sent: true };
}

/** Every shop with a review link: text the visits finished in the last three days, during the shop's day. */
export async function runReviewRequests(
  options: { now?: Date; perShop?: number; budgetMs?: number; send?: SendFn } = {},
) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 20_000);
  const tally = { shops: 0, sent: 0, skipped: 0 };
  let cursor: string | undefined;
  for (;;) {
    const shops = await prisma.business.findMany({
      where: {
        reviewRequestsOn: true,
        reviewUrl: { not: null },
        isActive: true,
        environment: { not: "test" },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true, timezone: true },
    });
    if (!shops.length) break;
    cursor = shops[shops.length - 1].id;
    for (const shop of shops) {
      if (Date.now() > stopAt) return tally;
      if (!isShopDaytime(now, shop.timezone)) continue;
      tally.shops += 1;
      const due = await prisma.job.findMany({
        where: {
          businessId: shop.id,
          status: "completed",
          reviewRequestedAt: null,
          completedAt: {
            gte: new Date(now.getTime() - REVIEW_UNTIL_MS),
            lte: new Date(now.getTime() - REVIEW_AFTER_MS),
          },
        },
        orderBy: { completedAt: "asc" },
        take: options.perShop ?? 20,
        select: { id: true },
      });
      for (const job of due) {
        const result = await sendReviewRequest({ jobId: job.id, now, send: options.send });
        tally[result.sent ? "sent" : "skipped"] += 1;
      }
    }
    if (shops.length < 100) break;
  }
  return tally;
}

/** How many review links went out, for the owner's weekly picture. */
export async function reviewRequestsSince(businessId: string, since: Date) {
  return prisma.job.count({ where: { businessId, reviewRequestedAt: { gte: since } } });
}
