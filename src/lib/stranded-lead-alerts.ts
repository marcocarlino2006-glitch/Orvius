import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { buildLeadAlertDedupeKey } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const GRACE_MS = 2 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Twilio never redelivers an inbound text (and a fallback call returns TwiML
 * whether or not capture finished), so a function that dies between
 * saving the lead and queueing its alert would lose that alert for good. This
 * finds text leads with no alert row and queues one under the same dedupe key
 * the webhook uses, so it can never double up with the webhook's own.
 */
export async function alertStrandedTextLeads(now = new Date()): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: {
      businessId: { not: null },
      // Only texts and fallback calls that really arrived from Twilio; seeded demo leads carry other ids.
      OR: [
        { source: "sms", externalId: { startsWith: "SM" } },
        { source: "sms", externalId: { startsWith: "MM" } },
        { source: "voice-fallback", externalId: { startsWith: "voice-fallback:" } },
      ],
      business: { is: { environment: { not: "test" } } },
      createdAt: { gte: new Date(now.getTime() - LOOKBACK_MS), lte: new Date(now.getTime() - GRACE_MS) },
    },
    select: { id: true, businessId: true, source: true, externalId: true, phone: true, notes: true, serviceType: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (!leads.length) return 0;

  const alerted = new Set(
    (
      await prisma.ownerNotification.findMany({
        where: { leadId: { in: leads.map((l) => l.id) } },
        select: { leadId: true },
      })
    ).map((row) => row.leadId),
  );
  const stranded = leads.filter((l) => !alerted.has(l.id));
  if (!stranded.length) return 0;

  const shops = new Map(
    (
      await prisma.business.findMany({
        where: { id: { in: [...new Set(stranded.map((l) => l.businessId!))] } },
        select: { id: true, name: true, ownerPhone: true, ownerEmail: true },
      })
    ).map((shop) => [shop.id, shop]),
  );

  let queued = 0;
  for (const lead of stranded) {
    const shop = shops.get(lead.businessId!);
    if (!shop) continue;
    const result = await enqueueOwnerAlert({
      businessId: shop.id,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      businessName: shop.name,
      message:
        lead.source === "voice-fallback"
          ? `Missed call from ${lead.phone || "an unknown number"}. Our AI line could not answer, so they were sent to voicemail. Call them back — they were not spoken to.`
          : [`New text · ${lead.serviceType ?? "SMS inquiry"}`, lead.phone, lead.notes ? `Message: ${lead.notes}` : null]
              .filter(Boolean)
              .join("\n"),
      leadId: lead.id,
      dedupeKey: buildLeadAlertDedupeKey({ messageSid: lead.externalId || lead.id }),
    });
    if (result.queued.length) {
      queued += 1;
      logWarn("notifications.stranded_text_lead_alerted", { businessId: shop.id, leadId: lead.id, source: lead.source });
    }
  }
  return queued;
}
