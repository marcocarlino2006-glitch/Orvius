import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { invoiceOpenBalanceCents, invoicePayUrl } from "@/lib/invoice-pay";
import { isShopDaytime } from "@/lib/lead-follow-up";
import { logInfo, logWarn } from "@/lib/logger";
import { formatCentsExact } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { nextIntentVersion } from "@/lib/sms-intent";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { textingHeld } from "@/lib/twilio-sms";

/**
 * A bill the customer was sent and hasn't paid gets at most two polite texts:
 * one three days after the pay link, one a week after that. Only shops that
 * chose automatic follow-ups and can take cards are touched, only during the
 * shop's day, never past a STOP, and never for a bill that is paid, voided,
 * refunded, or whose last text did not go through.
 */

const DAY_MS = 24 * 60 * 60_000;
export const FIRST_REMINDER_AFTER_MS = 3 * DAY_MS;
export const SECOND_REMINDER_AFTER_MS = 7 * DAY_MS;
export const REMINDERS_STOP_AFTER_MS = 45 * DAY_MS;
export const MAX_REMINDERS = 2;
export const REMINDER_EVENT = "invoice.reminder";

const FAILED_TEXT = new Set(["rejected", "undelivered", "retry_exhausted", "unknown_submission"]);

export type ReminderState = {
  sentAt: Date | null;
  remindersSent: number;
  lastReminderAt: Date | null;
  lastTextStatus: string | null;
};

export type ReminderBlock = "not_sent" | "too_old" | "last_text_failed" | "limit_reached" | "too_soon";

export function reminderBlock(state: ReminderState, now: Date): ReminderBlock | null {
  if (!state.sentAt) return "not_sent";
  if (now.getTime() - state.sentAt.getTime() > REMINDERS_STOP_AFTER_MS) return "too_old";
  if (state.lastTextStatus && FAILED_TEXT.has(state.lastTextStatus)) return "last_text_failed";
  if (state.remindersSent >= MAX_REMINDERS) return "limit_reached";
  const anchor = Math.max(state.sentAt.getTime(), state.lastReminderAt?.getTime() ?? 0);
  const wait = state.remindersSent === 0 ? FIRST_REMINDER_AFTER_MS : SECOND_REMINDER_AFTER_MS;
  return now.getTime() - anchor < wait ? "too_soon" : null;
}

export function reminderMessage(params: { businessName: string; balanceCents: number; payUrl: string }) {
  return withSmsOptOutFooter(
    `${params.businessName}: a friendly reminder that your balance of ${formatCentsExact(params.balanceCents)} is still open. Pay securely here: ${params.payUrl}`,
  );
}

type SendFn = typeof sendCustomerSms;

export async function sendInvoiceReminder(params: {
  invoiceId: string;
  now?: Date;
  send?: SendFn;
}): Promise<{ sent: true } | { sent: false; reason: string }> {
  const now = params.now ?? new Date();
  const send = params.send ?? sendCustomerSms;
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      id: true,
      businessId: true,
      amountCents: true,
      status: true,
      sentAt: true,
      paidAt: true,
      publicToken: true,
      payments: { select: { amountCents: true, status: true } },
      job: {
        select: {
          id: true,
          status: true,
          customer: { select: { phone: true } },
          lead: { select: { phone: true } },
        },
      },
      business: { select: { id: true, name: true } },
    },
  });
  if (!invoice) return { sent: false, reason: "not_found" };
  if (invoice.paidAt || ["paid", "void", "refunded", "draft"].includes(invoice.status)) return { sent: false, reason: "not_open" };
  if (!invoice.publicToken || invoice.amountCents <= 0) return { sent: false, reason: "no_pay_link" };
  if (!invoice.job || invoice.job.status !== "completed") return { sent: false, reason: "job_not_completed" };
  const balance = invoiceOpenBalanceCents({ amountCents: invoice.amountCents, payments: invoice.payments });
  if (balance <= 0) return { sent: false, reason: "no_balance" };

  const phone = invoice.job.customer?.phone ?? invoice.job.lead?.phone ?? null;
  const to = normalizePhone(phone ?? "");
  if (!to) return { sent: false, reason: "no_phone" };

  const [reminders, payLink] = await Promise.all([
    prisma.smsIntent.findMany({
      where: { businessId: invoice.businessId, eventType: REMINDER_EVENT, eventId: invoice.id, recipientNormalized: to, channel: "sms" },
      orderBy: { messageVersion: "desc" },
      select: { createdAt: true, status: true },
    }),
    prisma.smsIntent.findFirst({
      where: { businessId: invoice.businessId, eventType: "invoice.pay_link", eventId: invoice.id, recipientNormalized: to, channel: "sms" },
      orderBy: { messageVersion: "desc" },
      select: { status: true },
    }),
  ]);
  const lastReminder = reminders[0] ?? null;
  const block = reminderBlock(
    {
      sentAt: invoice.sentAt,
      remindersSent: reminders.length,
      lastReminderAt: lastReminder?.createdAt ?? null,
      lastTextStatus: lastReminder?.status ?? payLink?.status ?? null,
    },
    now,
  );
  if (block) return { sent: false, reason: block };

  const result = await send({
    businessId: invoice.businessId,
    to,
    body: reminderMessage({ businessName: invoice.business.name, balanceCents: balance, payUrl: invoicePayUrl(invoice.publicToken) }),
    intent: {
      eventType: REMINDER_EVENT,
      eventId: invoice.id,
      authorizedBy: "auto:invoice_reminder",
      ...(await nextIntentVersion({ businessId: invoice.businessId, eventType: REMINDER_EVENT, eventId: invoice.id, to })),
    },
  });
  if (!result.sent) {
    logWarn("invoice_reminder.not_sent", { invoiceId: invoice.id, reason: result.reason });
    return { sent: false, reason: result.reason };
  }
  await recordAudit({
    businessId: invoice.businessId,
    entityType: "job",
    entityId: invoice.job.id,
    jobId: invoice.job.id,
    action: "invoice.reminder_sent",
    summary: `Reminder ${reminders.length + 1} of ${MAX_REMINDERS} texted for an unpaid bill`,
    idempotencyKey: `invoice-reminder:${invoice.id}:${reminders.length + 1}`,
  });
  logInfo("invoice_reminder.sent", { businessId: invoice.businessId, invoiceId: invoice.id, number: reminders.length + 1 });
  return { sent: true };
}

/** Every shop on automatic follow-ups that takes cards: remind the bills that have waited long enough, in the shop's day. */
export async function runInvoiceReminders(options: { now?: Date; perShop?: number; budgetMs?: number; send?: SendFn } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 20_000);
  const tally = { shops: 0, sent: 0, skipped: 0, held: 0 };
  let cursor: string | undefined;
  for (;;) {
    const shops = await prisma.business.findMany({
      where: {
        followUpMode: "auto",
        isActive: true,
        environment: { not: "test" },
        stripeConnectChargesEnabled: true,
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
      if (!options.send && (await textingHeld(shop.id))) {
        tally.held += 1;
        continue;
      }
      const due = await prisma.invoice.findMany({
        where: {
          businessId: shop.id,
          paidAt: null,
          amountCents: { gt: 0 },
          status: { notIn: ["draft", "paid", "void", "refunded"] },
          publicToken: { not: null },
          sentAt: {
            gte: new Date(now.getTime() - REMINDERS_STOP_AFTER_MS),
            lte: new Date(now.getTime() - FIRST_REMINDER_AFTER_MS),
          },
        },
        orderBy: { sentAt: "asc" },
        take: 200,
        select: { id: true },
      });
      let sentHere = 0;
      for (const invoice of due) {
        if (sentHere >= (options.perShop ?? 20) || Date.now() > stopAt) break;
        const result = await sendInvoiceReminder({ invoiceId: invoice.id, now, send: options.send });
        tally[result.sent ? "sent" : "skipped"] += 1;
        if (result.sent) sentHere += 1;
      }
    }
    if (shops.length < 100) break;
  }
  return tally;
}
