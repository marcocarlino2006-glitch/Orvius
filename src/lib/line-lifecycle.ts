import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { isLineEntitled, PAST_DUE_LINE_DAYS } from "@/lib/billing-entitlement";
import { getAppUrl } from "@/lib/env";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { getShopLineForBusiness, isDemoPlatformLine } from "@/lib/demo-business";
import { getWebhookUrl } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { releasePhoneNumber } from "@/lib/twilio-phone";
import { deleteAssistant, removeVapiNumber, routeVapiNumberToServer } from "@/lib/vapi";
import { attachAssistantToShopLine } from "@/lib/vapi-line";

/** Days a canceled shop keeps its number, so coming back doesn't mean a new number on every truck. */
export const LINE_RETENTION_DAYS = 30;

type LineShop = Pick<Business, "id" | "name" | "twilioPhone" | "vapiPhoneNumber" | "vapiAssistantId" | "slug">;

function ownLine(shop: LineShop): string | null {
  const line = getShopLineForBusiness(shop);
  return line && !isDemoPlatformLine(line) ? line : null;
}

/** Canceled: stop the assistant answering (and billing minutes). The number is kept for the retention window. */
export async function suspendShopLine(shop: LineShop): Promise<boolean> {
  const line = ownLine(shop);
  if (!line) return false;
  try {
    const routed = await routeVapiNumberToServer({
      number: line,
      serverUrl: getWebhookUrl("/api/webhooks/vapi"),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    });
    if (!routed) {
      logError("line.suspend_not_found", { businessId: shop.id, line });
      return false;
    }
    await prisma.business.update({ where: { id: shop.id }, data: { lineSuspendedAt: new Date() } });
    await recordAudit({
      businessId: shop.id,
      entityType: "shop",
      entityId: shop.id,
      action: "line.suspended",
      summary: `Plan ended — ${line} stopped answering. The number is kept for ${LINE_RETENTION_DAYS} days.`,
    });
    return true;
  } catch (error) {
    logError("line.suspend_failed", { businessId: shop.id, error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

/** Paying again: the shop's own assistant answers its own number. */
export async function resumeShopLine(shop: LineShop): Promise<boolean> {
  const line = ownLine(shop);
  if (!line || !shop.vapiAssistantId) return false;
  try {
    await attachAssistantToShopLine({ phone: line, assistantId: shop.vapiAssistantId, shopName: shop.name });
    await prisma.business.update({ where: { id: shop.id }, data: { lineSuspendedAt: null } });
    await recordAudit({
      businessId: shop.id,
      entityType: "shop",
      entityId: shop.id,
      action: "line.resumed",
      summary: `Plan active — ${line} is answering again.`,
    });
    return true;
  } catch (error) {
    logError("line.resume_failed", { businessId: shop.id, error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

/**
 * Give the number back to Twilio and remove the assistant. Each step is
 * attempted even if another fails; the result says what is still billing.
 */
export async function releaseShopLine(shop: LineShop): Promise<{ line: string | null; released: boolean; assistantDeleted: boolean }> {
  const line = ownLine(shop);
  let released = !line;
  let assistantDeleted = !shop.vapiAssistantId;
  if (line) {
    try {
      await removeVapiNumber(line);
    } catch (error) {
      logWarn("line.release.vapi_number_failed", { businessId: shop.id, error: error instanceof Error ? error.message : "unknown" });
    }
    try {
      await releasePhoneNumber(line);
      released = true;
    } catch (error) {
      logError("line.release.twilio_failed", { businessId: shop.id, line, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  if (shop.vapiAssistantId) {
    try {
      await deleteAssistant(shop.vapiAssistantId);
      assistantDeleted = true;
    } catch (error) {
      logError("line.release.assistant_failed", { businessId: shop.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { line, released, assistantDeleted };
}

/**
 * A canceled plan suspends its line at once, from the Stripe webhook. A plan
 * that stays past due (Stripe can be set to leave it there) or a pilot that
 * ended unpaid never sends that event, so without this sweep their lines
 * answered for free indefinitely. Paying again resumes the line from the
 * same webhook that marks the plan active.
 */
export async function suspendUnpaidLines(now = new Date(), { limit = 100 } = {}) {
  const candidates = await prisma.business.findMany({
    where: {
      environment: "production",
      lineSuspendedAt: null,
      lineReleasedAt: null,
      billingStatus: { in: ["past_due", "pilot", "none"] },
      OR: [{ twilioPhone: { not: null } }, { vapiPhoneNumber: { not: null } }],
    },
    orderBy: { id: "asc" },
    take: 2_000,
  });
  const due = candidates.filter((shop) => !isLineEntitled(shop, now)).slice(0, limit);
  let suspended = 0;
  for (const shop of due) {
    if (!(await suspendShopLine(shop))) continue;
    suspended += 1;
    const why =
      shop.billingStatus === "past_due"
        ? `the card payment has failed for ${PAST_DUE_LINE_DAYS} days`
        : "the free pilot ended without a plan";
    await enqueueOwnerAlert({
      businessId: shop.id,
      businessName: shop.name,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      dedupeKey: `billing:line_suspended:${shop.id}:${now.toISOString().slice(0, 10)}`,
      message: `Orvius: ${shop.name}'s line has stopped answering because ${why}. Callers hear a short message to reach you directly. Pay and it answers again within a minute: ${getAppUrl().replace(/\/$/, "")}/dashboard?settings=billing`,
    }).catch((error: unknown) =>
      logWarn("line.suspend_alert_failed", { businessId: shop.id, error: error instanceof Error ? error.message : "unknown" }),
    );
  }
  return { due: due.length, suspended };
}

/**
 * Release numbers of shops canceled longer than the retention window. Releasing
 * is permanent, so it only acts when ORVIUS_RELEASE_LAPSED_LINES=1; otherwise
 * it reports what it would release.
 */
export async function releaseLapsedLines(now = new Date()) {
  const cutoff = new Date(now.getTime() - LINE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const lapsed = await prisma.business.findMany({
    where: {
      billingStatus: "canceled",
      canceledAt: { lte: cutoff },
      lineReleasedAt: null,
      environment: "production",
      OR: [{ twilioPhone: { not: null } }, { vapiPhoneNumber: { not: null } }],
    },
    take: 50,
  });
  const live = process.env.ORVIUS_RELEASE_LAPSED_LINES?.trim() === "1";
  if (!live) {
    if (lapsed.length) logInfo("line.release.dry_run", { shops: lapsed.map((b) => ({ id: b.id, line: ownLine(b) })) });
    return { mode: "dry_run" as const, due: lapsed.length, released: 0 };
  }

  let released = 0;
  for (const shop of lapsed) {
    const result = await releaseShopLine(shop);
    if (!result.released) continue;
    released += 1;
    await prisma.business.update({
      where: { id: shop.id },
      data: { lineReleasedAt: now, twilioPhone: null, vapiPhoneNumber: null, ...(result.assistantDeleted ? { vapiAssistantId: null } : {}) },
    });
    await recordAudit({
      businessId: shop.id,
      entityType: "shop",
      entityId: shop.id,
      action: "line.released",
      summary: `Canceled over ${LINE_RETENTION_DAYS} days — ${result.line} returned to the carrier.`,
    });
  }
  return { mode: "live" as const, due: lapsed.length, released };
}
