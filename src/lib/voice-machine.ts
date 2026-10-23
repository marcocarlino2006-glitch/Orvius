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

export function voiceRoute(business: object): { webhookUrl: string; webhookSecret?: string } {
  const id = "voiceMachineId" in business && typeof business.voiceMachineId === "string" ? business.voiceMachineId : null;
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

export class VoiceMachineColumnMissing extends Error {
  constructor() {
    super("voiceMachineId is not on this database yet");
  }
}

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such column/i.test(message);
}

async function machineColumn<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (missingColumn(error)) throw new VoiceMachineColumnMissing();
    throw error;
  }
}

/** Create this shop's voice process once. A second call returns the same id. */
export async function ensureVoiceMachine(businessId: string): Promise<string> {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!shop) throw new Error("Shop not found");
  const current = await machineColumn(async () => {
    const rows = await prisma.$queryRaw<Array<{ voiceMachineId: string | null }>>`
      SELECT "voiceMachineId" AS voiceMachineId FROM "Business" WHERE "id" = ${businessId} LIMIT 1
    `;
    return rows[0]?.voiceMachineId ?? null;
  });
  if (current) return current;
  const id = randomBytes(16).toString("hex");
  const won = await machineColumn(() => prisma.$executeRaw`
    UPDATE "Business" SET "voiceMachineId" = ${id} WHERE "id" = ${businessId} AND "voiceMachineId" IS NULL
  `);
  if (Number(won) === 1) return id;
  const again = await machineColumn(async () => {
    const rows = await prisma.$queryRaw<Array<{ voiceMachineId: string | null }>>`
      SELECT "voiceMachineId" AS voiceMachineId FROM "Business" WHERE "id" = ${businessId} LIMIT 1
    `;
    return rows[0]?.voiceMachineId ?? null;
  });
  if (!again) throw new Error("The voice machine was not saved.");
  return again;
}

/** The business id this machine route is sealed to. Null when the seal is wrong or the column is not there yet. */
export async function businessIdForVoiceMachine(machineId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; isActive: number | boolean }>>`
      SELECT "id" AS id, "isActive" AS isActive FROM "Business" WHERE "voiceMachineId" = ${machineId} LIMIT 1
    `;
    const shop = rows[0];
    if (!shop || Number(shop.isActive) === 0) return null;
    return shop.id;
  } catch (error) {
    if (missingColumn(error)) return null;
    throw error;
  }
}

/** Open the process. The presented seal has to be this machine's, and the shop has to be active. */
export async function openVoiceMachine(machineId: string, presented: string | null) {
  const secret = machineSeal(machineId);
  if (!secret || !secretsMatch(presented, secret)) return null;
  const businessId = await businessIdForVoiceMachine(machineId);
  if (!businessId) return null;
  return { machineId, businessId };
}
