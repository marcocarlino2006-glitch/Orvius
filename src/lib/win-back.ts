import { recordAudit, type AuditActor } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { getAppUrl } from "@/lib/env";
import { isShopDaytime } from "@/lib/lead-follow-up";
import { logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Win-back: the owner texts customers who haven't been back in a while. It is
 * always the owner's send, never automatic, so replies land as the owner's
 * conversation in Inbox → Messages. One text per customer per 90 days, never
 * to someone with a visit already booked, never past a STOP, daytime only.
 */

export const WIN_BACK_GAP_MS = 90 * 24 * 60 * 60_000;
export const WIN_BACK_MAX_PER_SEND = 100;
export const WIN_BACK_MONTHS = [3, 6, 12] as const;
export type WinBackMonths = (typeof WIN_BACK_MONTHS)[number];

const MONTH_MS = 30 * 24 * 60 * 60_000;

export function defaultWinBackMessage(bookingLink: boolean) {
  return `Hi {first}, it's {business}. It's been a while since your last visit. Want us to get you on the schedule?${bookingLink ? " Book here: {link}" : " Reply with a day that works."} Reply STOP to opt out.`;
}

function firstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first && /^[\p{L}'-]{2,}$/u.test(first) ? first : null;
}

export function renderWinBack(template: string, values: { name: string | null; businessName: string; link: string | null }) {
  const first = firstName(values.name);
  let body = template
    .replace(/\{business\}/g, values.businessName)
    .replace(/\{link\}/g, values.link ?? "")
    .replace(/\{first\}/g, first ?? "");
  if (!first) body = body.replace(/^Hi\s*,\s*/i, "Hi, ");
  body = body.replace(/[ \t]{2,}/g, " ").trim();
  if (!/\bSTOP\b/i.test(body)) body = `${body} Reply STOP to opt out.`;
  return body;
}

function audienceWhere(businessId: string, months: number, now: Date) {
  return {
    businessId,
    lastSeenAt: { lt: new Date(now.getTime() - months * MONTH_MS) },
    OR: [{ winBackSentAt: null }, { winBackSentAt: { lt: new Date(now.getTime() - WIN_BACK_GAP_MS) } }],
    jobs: {
      some: { status: "completed" },
      none: { status: { notIn: ["completed", "cancelled"] }, scheduledAt: { gte: now } },
    },
  };
}

export async function winBackAudience(businessId: string, months: number, now = new Date()) {
  const [candidates, optOuts] = await Promise.all([
    prisma.customer.findMany({
      where: audienceWhere(businessId, months, now),
      orderBy: { lastSeenAt: "desc" },
      take: 2000,
      select: { id: true, name: true, phone: true, phoneNormalized: true, lastSeenAt: true },
    }),
    prisma.smsOptOut.findMany({ where: { businessId, clearedAt: null }, select: { phoneNormalized: true } }),
  ]);
  const stopped = new Set(optOuts.map((o) => o.phoneNormalized));
  return candidates.filter((c) => normalizePhone(c.phone) && !stopped.has(c.phoneNormalized));
}

export type WinBackResult =
  | { ok: true; sent: number; skipped: number; remaining: number }
  | { ok: false; reason: "night" | "empty_message" | "too_long"; message: string };

export async function sendWinBack(params: {
  businessId: string;
  months: number;
  template: string;
  by: { actor: AuditActor; actorEmail: string };
  now?: Date;
  send?: typeof sendCustomerSms;
}): Promise<WinBackResult> {
  const now = params.now ?? new Date();
  const send = params.send ?? sendCustomerSms;
  const template = params.template.trim();
  if (!template) return { ok: false, reason: "empty_message", message: "Write the message first." };
  if (template.length > 480) return { ok: false, reason: "too_long", message: "Keep it under 480 characters (three texts)." };

  const shop = await prisma.business.findUniqueOrThrow({
    where: { id: params.businessId },
    select: { name: true, timezone: true, slug: true, bookingPageOn: true },
  });
  if (!isShopDaytime(now, shop.timezone)) {
    return { ok: false, reason: "night", message: "Texts to customers go out between 9am and 8pm your time. Try again then." };
  }
  const link = shop.bookingPageOn ? `${getAppUrl().replace(/\/$/, "")}/b/${shop.slug}` : null;

  const audience = await winBackAudience(params.businessId, params.months, now);
  const batch = audience.slice(0, WIN_BACK_MAX_PER_SEND);
  let sent = 0;
  let skipped = 0;
  for (const customer of batch) {
    const claim = await prisma.customer.updateMany({
      where: { id: customer.id, ...audienceWhere(params.businessId, params.months, now) },
      data: { winBackSentAt: now },
    });
    if (claim.count === 0) {
      skipped += 1;
      continue;
    }
    const result = await send({
      businessId: params.businessId,
      to: customer.phone,
      body: renderWinBack(template, { name: customer.name, businessName: shop.name, link }),
      author: "owner",
    });
    if (result.sent) {
      sent += 1;
    } else {
      skipped += 1;
      if (result.reason === "sms_not_configured") {
        await prisma.customer.updateMany({ where: { id: customer.id, winBackSentAt: now }, data: { winBackSentAt: null } });
      }
    }
  }

  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "customers.win_back_sent",
    summary: `Win-back text sent to ${sent} customer${sent === 1 ? "" : "s"} not seen in ${params.months}+ months`,
    detail: { months: params.months, sent, skipped },
    ...params.by,
  });
  logInfo("win_back.sent", { businessId: params.businessId, sent, skipped });
  return { ok: true, sent, skipped, remaining: Math.max(0, audience.length - batch.length) };
}
