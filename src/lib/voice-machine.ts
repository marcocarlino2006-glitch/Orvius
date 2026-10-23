import { createHmac, randomBytes } from "crypto";
import { normalizePhone } from "@/lib/customer";
import { isDemoBusiness, workspaceEnvironment } from "@/lib/demo-business";
import { getWebhookUrl, secretsMatch } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/*
  One voice process per live shop. The process is the route
  /api/webhooks/vapi/machines/[id]. The seal is known only to that route.
  A call whose assistant or number belongs to another shop is refused, and a
  call record that already belongs to another shop is not rewritten.
  The public demo stays on the shared route.
*/

export class ForeignVoiceShop extends Error {
  constructor() {
    super("Another shop has no route to this machine.");
  }
}

export function machineKey(): string | null {
  return process.env.ORVIUS_MACHINE_KEY?.trim() || process.env.VAPI_WEBHOOK_SECRET?.trim() || null;
}

/** The secret Vapi must present to this shop's route. Null when no key is configured. */
export function machineSeal(machineId: string): string | null {
  const key = machineKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`voice-machine:${machineId}`).digest("hex");
}

export function shopGetsOwnVoiceMachine(business: { environment?: string | null; slug: string; name?: string }): boolean {
  return workspaceEnvironment(business.environment) === "production" && !isDemoBusiness(business);
}

export function voiceRoute(business: { voiceMachineId?: string | null }): { webhookUrl: string; webhookSecret?: string } {
  const id = business.voiceMachineId;
  const secret = id ? machineSeal(id) : null;
  if (id && secret) {
    return { webhookUrl: getWebhookUrl(`/api/webhooks/vapi/machines/${id}`), webhookSecret: secret };
  }
  return { webhookUrl: getWebhookUrl("/api/webhooks/vapi"), webhookSecret: process.env.VAPI_WEBHOOK_SECRET };
}

function sameLine(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return Boolean(left && right && left === right);
}

/**
 * A call may enter this shop's process only when every identifier it carries
 * is this shop's. A missing identifier is not a pass.
 */
export function callBelongsToShop(
  shop: { id: string; vapiAssistantId?: string | null; twilioPhone?: string | null; vapiPhoneNumber?: string | null },
  call: { assistantId?: string | null; inboundNumber?: string | null; existingBusinessId?: string | null },
): boolean {
  if (call.existingBusinessId && call.existingBusinessId !== shop.id) return false;
  if (call.assistantId && call.assistantId !== shop.vapiAssistantId) return false;
  const lines = [shop.twilioPhone, shop.vapiPhoneNumber].filter((line): line is string => Boolean(line));
  if (call.inboundNumber && lines.length > 0 && !lines.some((line) => sameLine(line, call.inboundNumber))) return false;
  if (call.existingBusinessId === shop.id) return true;
  if (call.assistantId && call.assistantId === shop.vapiAssistantId) return true;
  if (call.inboundNumber && lines.some((line) => sameLine(line, call.inboundNumber))) return true;
  return false;
}

/** Create this shop's voice process once. A second call returns the same id. */
export async function ensureVoiceMachine(businessId: string): Promise<string> {
  const current = await prisma.business.findUnique({ where: { id: businessId }, select: { voiceMachineId: true } });
  if (!current) throw new Error("Shop not found");
  if (current.voiceMachineId) return current.voiceMachineId;
  const id = randomBytes(16).toString("hex");
  const won = await prisma.business.updateMany({ where: { id: businessId, voiceMachineId: null }, data: { voiceMachineId: id } });
  if (won.count === 1) return id;
  const again = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { voiceMachineId: true } });
  if (!again.voiceMachineId) throw new Error("The voice machine was not saved.");
  return again.voiceMachineId;
}

/** Open the process. The presented seal has to be this machine's, and the shop has to be active. */
export async function openVoiceMachine(machineId: string, presented: string | null) {
  const secret = machineSeal(machineId);
  if (!secret || !secretsMatch(presented, secret)) return null;
  const shop = await prisma.business.findUnique({
    where: { voiceMachineId: machineId },
    select: { id: true, isActive: true, voiceMachineId: true },
  });
  if (!shop?.isActive || shop.voiceMachineId !== machineId) return null;
  return { machineId: shop.voiceMachineId, businessId: shop.id };
}
