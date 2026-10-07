import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilio-sms";
import { isEmergency } from "@/lib/urgency";

/** How long an emergency may sit with nobody working it before Orvius alerts again. */
export const EMERGENCY_ACK_WAIT_MS = 10 * 60_000;
const LOOKBACK_MS = 24 * 60 * 60_000;
export const EMERGENCY_ESCALATED = "lead.emergency_unacked";

type AckLead = {
  status: string | null;
  firstContactedAt: Date | null;
  closedAt: Date | null;
};

/** A person has picked an emergency up once they contacted the caller or moved it on. */
export function emergencyAcknowledged(lead: AckLead): boolean {
  if (lead.firstContactedAt || lead.closedAt) return true;
  const status = (lead.status ?? "new").toLowerCase();
  return status !== "new";
}

/**
 * Delivery is not acknowledgement. An emergency the owner was alerted about
 * but nobody has worked after ten minutes is alerted again on every channel,
 * the shop's backup number is texted, and the escalation is written to the
 * audit trail. Each emergency escalates once; the idempotency key on the
 * audit row and the dedupe key on the alert keep overlapping sweeps from
 * doubling up.
 */
export async function escalateUnackedEmergencies(now = new Date()): Promise<number> {
  const candidates = await prisma.lead.findMany({
    where: {
      businessId: { not: null },
      business: { is: { environment: { not: "test" } } },
      createdAt: { gte: new Date(now.getTime() - LOOKBACK_MS), lte: new Date(now.getTime() - EMERGENCY_ACK_WAIT_MS) },
      firstContactedAt: null,
      closedAt: null,
    },
    select: {
      id: true,
      businessId: true,
      name: true,
      phone: true,
      address: true,
      serviceType: true,
      urgency: true,
      status: true,
      firstContactedAt: true,
      closedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (!candidates.length) return 0;

  const ids = candidates.map((l) => l.id);
  const [safetyRows, escalatedRows] = await Promise.all([
    prisma.auditEvent.findMany({ where: { leadId: { in: ids }, action: "lead.escalated" }, select: { leadId: true } }),
    prisma.auditEvent.findMany({ where: { leadId: { in: ids }, action: EMERGENCY_ESCALATED }, select: { leadId: true } }),
  ]);
  const safety = new Set(safetyRows.map((r) => r.leadId));
  const escalated = new Set(escalatedRows.map((r) => r.leadId));
  const due = candidates.filter(
    (l) => (isEmergency(l.urgency) || safety.has(l.id)) && !escalated.has(l.id) && !emergencyAcknowledged(l),
  );
  if (!due.length) return 0;

  const shops = new Map(
    (
      await prisma.business.findMany({
        where: { id: { in: [...new Set(due.map((l) => l.businessId!))] } },
        select: { id: true, name: true, ownerPhone: true, ownerEmail: true, transferPhone: true },
      })
    ).map((s) => [s.id, s]),
  );

  let count = 0;
  for (const lead of due) {
    const shop = shops.get(lead.businessId!);
    if (!shop) continue;
    const auditId = await recordAudit({
      businessId: shop.id,
      entityType: "lead",
      entityId: lead.id,
      leadId: lead.id,
      action: EMERGENCY_ESCALATED,
      actor: "system",
      summary: "Nobody picked up the emergency within 10 minutes, so Orvius alerted again and texted the backup number.",
      idempotencyKey: `lead:${lead.id}:${EMERGENCY_ESCALATED}`,
    });
    if (!auditId) continue;

    const what = lead.serviceType ?? "Emergency";
    const message = [
      `UNANSWERED EMERGENCY · ${what}`,
      [lead.name, lead.phone].filter(Boolean).join(" · ") || "Unknown caller",
      lead.address,
      "Nobody has called them back yet. Call now, then mark them contacted.",
    ]
      .filter(Boolean)
      .join("\n");
    await enqueueOwnerAlert({
      businessId: shop.id,
      leadId: lead.id,
      dedupeKey: `emergency-unacked:${lead.id}`,
      businessName: shop.name,
      message,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
    });
    const backup = shop.transferPhone?.trim();
    if (backup && backup !== shop.ownerPhone?.trim()) {
      await sendSms({ to: backup, body: `${shop.name}: ${message}`, businessId: shop.id, audience: "owner" }).catch(() => null);
    }
    logWarn("emergency.unacked_escalated", { businessId: shop.id, leadId: lead.id });
    count += 1;
  }
  return count;
}
