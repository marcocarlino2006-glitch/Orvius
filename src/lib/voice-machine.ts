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
  Until voiceMachineId is on the database, a live shop's own id is that route.
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

function shopNamedOn(business: object): { environment?: string | null; slug: string; name?: string } | null {
  if (!("slug" in business) || typeof business.slug !== "string") return null;
  const environment = "environment" in business && (typeof business.environment === "string" || business.environment == null) ? business.environment : undefined;
  const name = "name" in business && typeof business.name === "string" ? business.name : undefined;
  return { environment, slug: business.slug, name };
}

export function voiceRoute(business: object): { webhookUrl: string; webhookSecret?: string } {
  const id = "voiceMachineId" in business && typeof business.voiceMachineId === "string" ? business.voiceMachineId : null;
  const secret = id ? machineSeal(id) : null;
  const named = shopNamedOn(business);
  const own = named ? shopGetsOwnVoiceMachine(named) : true;
  if (id && secret && own) {
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

function columnErrorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown; meta?: { message?: unknown } };
    if (record.code === "P2022") return "P2022";
    if (typeof record.message === "string") parts.push(record.message);
    if (typeof record.meta?.message === "string") parts.push(record.meta.message);
    current = record.cause;
  }
  if (typeof error === "string") parts.push(error);
  return parts.join(" ");
}

function missingColumn(error: unknown) {
  const message = columnErrorText(error);
  return message === "P2022" || /no such column/i.test(message) || /has no column named/i.test(message) || /does not exist in the current database/i.test(message);
}

/*
  SQLite accepts a missing double-quoted column as a string literal. A read of
  "voiceMachineId" then returns the text voiceMachineId for every shop, and a
  filter on it matches every row. That text is never a machine id.
*/
const QUOTED_COLUMN_SENTINEL = "voiceMachineId";

function realStoredId(value: string | null | undefined): string | null {
  if (!value || value === QUOTED_COLUMN_SENTINEL) return null;
  return value;
}

async function machineColumn<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (missingColumn(error)) throw new VoiceMachineColumnMissing();
    throw error;
  }
}

/** Create this shop's voice process once. A second call returns the same id.
 *  A live shop whose database has no voiceMachineId column yet uses its own id.
 *  The demo has no separate door.
 */
export async function ensureVoiceMachine(businessId: string): Promise<string> {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, environment: true, slug: true, name: true },
  });
  if (!shop) throw new Error("Shop not found");
  try {
    const current = await machineColumn(async () => {
      const rows = await prisma.$queryRaw<Array<{ voiceMachineId: string | null }>>`
        SELECT "voiceMachineId" AS voiceMachineId FROM "Business" WHERE "id" = ${businessId} LIMIT 1
      `;
      return rows[0]?.voiceMachineId ?? null;
    });
    if (current === QUOTED_COLUMN_SENTINEL) throw new VoiceMachineColumnMissing();
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
    if (again === QUOTED_COLUMN_SENTINEL) throw new VoiceMachineColumnMissing();
    if (!again) throw new Error("The voice machine was not saved.");
    return again;
  } catch (error) {
    if (!(error instanceof VoiceMachineColumnMissing)) throw error;
    if (!shopGetsOwnVoiceMachine(shop)) throw error;
    return shop.id;
  }
}

/** An active live shop may be opened by its own id while it has no stored machine id. */
async function doorForShopId(machineId: string, storedId: string | null | undefined): Promise<string | null> {
  if (storedId) return null;
  const shop = await prisma.business.findUnique({
    where: { id: machineId },
    select: { id: true, isActive: true, environment: true, slug: true, name: true },
  });
  if (!shop?.isActive || !shopGetsOwnVoiceMachine(shop)) return null;
  return shop.id;
}

/** The business id this machine route is sealed to. Null when no active live shop owns it. */
export async function businessIdForVoiceMachine(machineId: string): Promise<string | null> {
  if (!machineId || machineId === QUOTED_COLUMN_SENTINEL) return null;
  try {
    const stored = await prisma.$queryRaw<Array<{ voiceMachineId: string | null }>>`
      SELECT "voiceMachineId" AS voiceMachineId FROM "Business" WHERE "id" = ${machineId} LIMIT 1
    `;
    if (stored[0]) {
      const id = realStoredId(stored[0].voiceMachineId);
      if (!id || id === machineId) return doorForShopId(machineId, null);
      return null;
    }
    const rows = await prisma.$queryRaw<Array<{ id: string; isActive: number | boolean }>>`
      SELECT "id" AS id, "isActive" AS isActive FROM "Business" WHERE "voiceMachineId" = ${machineId} LIMIT 1
    `;
    const shop = rows[0];
    if (!shop || Number(shop.isActive) === 0) return null;
    return shop.id;
  } catch (error) {
    if (missingColumn(error)) return doorForShopId(machineId, null);
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
