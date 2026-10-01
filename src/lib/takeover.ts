import { recordAudit, type AuditActor } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

export type TakeoverActor = { email: string; actor: AuditActor };

/**
 * A person takes a customer's conversation from Orvius. While it holds,
 * automated texts to that phone are held (customer-sms) and the customer's
 * replies go to the owner instead of the auto-responder (messages). The voice
 * line still answers that caller; this is a texting handoff.
 */
export async function takeOverConversation(params: {
  businessId: string;
  phone: string;
  leadId?: string | null;
  by: TakeoverActor;
  reason?: string | null;
}): Promise<{ ok: true; phone: string; already: boolean } | { ok: false; error: string }> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return { ok: false, error: "That request has no usable phone number." };
  const key = { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } };
  const existing = await prisma.takeover.findUnique({ where: key });
  if (existing && !existing.releasedAt) return { ok: true, phone: phoneNormalized, already: true };
  const data = {
    leadId: params.leadId ?? null,
    takenBy: params.by.email,
    reason: params.reason?.slice(0, 200) ?? null,
    createdAt: new Date(),
    releasedAt: null,
    releasedBy: null,
  };
  await prisma.takeover.upsert({
    where: key,
    create: { businessId: params.businessId, phoneNormalized, ...data },
    update: data,
  });
  await recordAudit({
    businessId: params.businessId,
    entityType: params.leadId ? "lead" : "customer",
    entityId: params.leadId ?? phoneNormalized,
    action: "conversation.taken_over",
    actor: params.by.actor,
    actorEmail: params.by.email,
    summary: `${params.by.email} took this conversation over — Orvius stopped automated texts to ${phoneNormalized}`,
    detail: { phone: phoneNormalized, reason: params.reason ?? null },
    leadId: params.leadId ?? null,
  });
  return { ok: true, phone: phoneNormalized, already: false };
}

export async function releaseConversation(params: {
  businessId: string;
  phone: string;
  by: TakeoverActor;
}): Promise<{ ok: true; released: boolean } | { ok: false; error: string }> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return { ok: false, error: "That request has no usable phone number." };
  const released = await prisma.takeover.updateMany({
    where: { businessId: params.businessId, phoneNormalized, releasedAt: null },
    data: { releasedAt: new Date(), releasedBy: params.by.email },
  });
  if (!released.count) return { ok: true, released: false };
  const row = await prisma.takeover.findUnique({
    where: { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } },
    select: { leadId: true },
  });
  await recordAudit({
    businessId: params.businessId,
    entityType: row?.leadId ? "lead" : "customer",
    entityId: row?.leadId ?? phoneNormalized,
    action: "conversation.released",
    actor: params.by.actor,
    actorEmail: params.by.email,
    summary: `${params.by.email} handed the conversation back to Orvius`,
    detail: { phone: phoneNormalized },
    leadId: row?.leadId ?? null,
  });
  return { ok: true, released: true };
}

export async function activeTakeovers(businessId: string) {
  return prisma.takeover.findMany({
    where: { businessId, releasedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
