import type { Business } from "@prisma/client";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { isUniqueViolation } from "@/lib/unique-violation";

/**
 * Line-watch only saves a receptionist when something already looks wrong, so
 * a provider change that rejects saves (a retired voice model did, for ten
 * days) stays invisible until a shop edits its settings. Once a day one live
 * receptionist, a different one each day, is saved again as it stands; a
 * refusal reaches the founders through the vendor alarm in vapiRequest.
 */
export async function selfTestOneReceptionist(
  now = new Date(),
  deps: { sync: (business: Business) => Promise<unknown> } = { sync: syncBusinessAssistant },
): Promise<{ ran: false; reason: string } | { ran: true; businessId: string; ok: boolean; error?: string }> {
  if (!process.env.VAPI_API_KEY) return { ran: false, reason: "no VAPI_API_KEY" };
  const day = now.toISOString().slice(0, 10);
  try {
    await prisma.webhookEvent.create({ data: { source: "orvius", externalId: day, eventType: "self-test:receptionist-save", status: "processing" } });
  } catch (error) {
    if (isUniqueViolation(error)) return { ran: false, reason: "already ran today" };
    throw error;
  }
  const where = { isActive: true, vapiAssistantId: { not: null }, environment: { not: "test" } };
  const total = await prisma.business.count({ where });
  if (!total) {
    await finish(day, "skipped", null);
    return { ran: false, reason: "no live receptionists" };
  }
  const [shop] = await prisma.business.findMany({ where, orderBy: { id: "asc" }, skip: Math.floor(now.getTime() / 86_400_000) % total, take: 1 });
  try {
    await deps.sync(shop);
    await finish(day, "passed", null);
    logInfo("self_test.receptionist_saved", { businessId: shop.id });
    return { ran: true, businessId: shop.id, ok: true };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await finish(day, "failed", message);
    logWarn("self_test.receptionist_save_failed", { businessId: shop.id, error: message });
    return { ran: true, businessId: shop.id, ok: false, error: message };
  }
}

async function finish(day: string, status: string, error: string | null) {
  await prisma.webhookEvent.updateMany({
    where: { source: "orvius", externalId: day, eventType: "self-test:receptionist-save" },
    data: { status, error },
  });
}

/** The latest daily save test, for the admin Launch tab. */
export async function lastReceptionistSelfTest() {
  const row = await prisma.webhookEvent.findFirst({
    where: { source: "orvius", eventType: "self-test:receptionist-save" },
    orderBy: { createdAt: "desc" },
    select: { externalId: true, status: true, error: true },
  });
  return row ? { day: row.externalId, status: row.status, error: row.error } : null;
}
