import { randomBytes } from "node:crypto";
import { buildAssistantSystemPrompt } from "@/lib/business";
import { normalizePhone } from "@/lib/customer";
import { getAppUrl, getWebhookUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { DEFAULT_HOURS_JSON, servicesForTrade } from "@/lib/provision-business";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { sendSms } from "@/lib/twilio-sms";
import { buildVapiAssistantConfig, extractLeadFromStructuredData, type VapiWebhookMessage } from "@/lib/vapi";

export const PREVIEW_MAX_CALLS = 2;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_CAP = 300;

export type PreviewCapture = {
  name?: string;
  phone?: string;
  serviceType?: string;
  urgency?: string;
  address?: string;
};

export type PreviewStatus = {
  shopName: string;
  callsUsed: number;
  maxCalls: number;
  expiresAt: string;
  lastCallAt: string | null;
  summary: string | null;
  capture: PreviewCapture | null;
  alertSent: boolean;
};

function dailyCap(): number {
  const raw = Number(process.env.PREVIEW_DAILY_CAP);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DAILY_CAP;
}

export type CreatePreviewResult =
  | { ok: true; token: string; reused: boolean }
  | { ok: false; reason: "invalid_phone" | "daily_cap" };

/**
 * One active preview per phone: a second submit from the same mobile updates
 * that preview instead of minting more free calls.
 */
export async function createShopPreview(input: {
  shopName: string;
  serviceArea?: string | null;
  services?: string[];
  ownerPhone: string;
  ip?: string | null;
  now?: Date;
}): Promise<CreatePreviewResult> {
  const now = input.now ?? new Date();
  const phone = normalizePhone(input.ownerPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const servicesJson = input.services?.length
    ? JSON.stringify(input.services.map((name) => ({ name, description: "" })))
    : servicesForTrade("HVAC");
  const details = {
    shopName: input.shopName.trim(),
    serviceArea: input.serviceArea?.trim() || null,
    servicesJson,
  };

  const active = await prisma.shopPreview.findFirst({
    where: { ownerPhoneNormalized: phone, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    await prisma.shopPreview.update({ where: { id: active.id }, data: details });
    return { ok: true, token: active.token, reused: true };
  }

  const today = await prisma.shopPreview.count({
    where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  if (today >= dailyCap()) return { ok: false, reason: "daily_cap" };

  const token = randomBytes(18).toString("base64url");
  await prisma.shopPreview.create({
    data: {
      ...details,
      token,
      hoursJson: DEFAULT_HOURS_JSON,
      ownerPhone: input.ownerPhone.trim(),
      ownerPhoneNormalized: phone,
      ip: input.ip ?? null,
      maxCalls: PREVIEW_MAX_CALLS,
      expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS),
    },
  });
  return { ok: true, token, reused: false };
}

/**
 * Claim one preview call for this caller, atomically, so two calls racing on
 * the last free call cannot both get it. Returns null when the caller has no
 * preview or has used it up — they then hear the normal demo shop.
 */
export async function claimPreviewCall(params: {
  callerPhone: string | null | undefined;
  vapiCallId: string;
  now?: Date;
}) {
  const phone = normalizePhone(params.callerPhone);
  if (!phone) return null;
  const now = params.now ?? new Date();
  const preview = await prisma.shopPreview.findFirst({
    where: { ownerPhoneNormalized: phone, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!preview) return null;
  if (preview.lastVapiCallId === params.vapiCallId) return preview;

  const claimed = await prisma.shopPreview.updateMany({
    where: { id: preview.id, callsUsed: { lt: preview.maxCalls }, expiresAt: { gt: now } },
    data: {
      callsUsed: { increment: 1 },
      lastVapiCallId: params.vapiCallId,
      lastCallAt: now,
      lastSummary: null,
      lastCaptureJson: null,
      alertSentAt: null,
    },
  });
  if (claimed.count === 0) return null;
  return prisma.shopPreview.findUnique({ where: { id: preview.id } });
}

export function buildPreviewAssistant(preview: {
  id: string;
  shopName: string;
  serviceArea: string | null;
  servicesJson: string;
  hoursJson: string;
}) {
  const greeting = `Thank you for calling ${preview.shopName}. How can I help you today?`;
  const base = buildAssistantSystemPrompt({
    name: preview.shopName,
    greeting,
    hoursJson: preview.hoursJson,
    servicesJson: preview.servicesJson,
    trade: "HVAC",
    canBook: false,
  });
  const area = preview.serviceArea ? `\n\nSERVICE AREA\n- ${preview.shopName} serves ${preview.serviceArea}.` : "";
  const systemPrompt = `${base}${area}

PREVIEW CALL
- The shop owner is trying you out. Handle the call exactly as you would a real customer's.
- You cannot see the schedule on this call. Never say a technician is booked or give an arrival time; say the owner will text to confirm the time.`;

  return {
    ...buildVapiAssistantConfig({
      businessName: preview.shopName,
      systemPrompt,
      greeting,
      webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
      webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
      inCallBooking: false,
    }),
    metadata: { orviusPreviewId: preview.id },
  };
}

export async function findPreviewByVapiCallId(vapiCallId: string) {
  return prisma.shopPreview.findUnique({ where: { lastVapiCallId: vapiCallId } });
}

export function buildPreviewAlert(preview: { shopName: string; token: string }, capture: PreviewCapture): string {
  const lines = [
    `Orvius preview · ${preview.shopName}`,
    [capture.urgency, capture.serviceType].filter(Boolean).join(" · ") || "New call",
    capture.name,
    capture.address,
    capture.phone,
    "This is the alert you'd get for every call.",
    `Go live: ${getAppUrl()}/pricing?preview=${preview.token}`,
  ];
  return withSmsOptOutFooter(lines.filter(Boolean).join("\n"));
}

/** A preview call ended: keep what was captured for the page and text the owner once per call. */
export async function recordPreviewOutcome(
  preview: { id: string; token: string; shopName: string; ownerPhone: string; lastVapiCallId: string | null },
  message: VapiWebhookMessage["message"],
): Promise<void> {
  const lead = extractLeadFromStructuredData(message.analysis?.structuredData);
  const capture: PreviewCapture = {
    name: lead.name,
    phone: lead.phone ?? message.call?.customer?.number,
    serviceType: lead.serviceType,
    urgency: lead.urgency,
    address: lead.address,
  };
  const summary = message.summary ?? message.analysis?.summary ?? null;
  const stamped = await prisma.shopPreview.updateMany({
    where: { id: preview.id, lastVapiCallId: message.call?.id ?? preview.lastVapiCallId, lastCaptureJson: null },
    data: { lastSummary: summary, lastCaptureJson: JSON.stringify(capture) },
  });
  if (stamped.count === 0) return;

  try {
    const sent = await sendSms({ to: preview.ownerPhone, body: buildPreviewAlert(preview, capture), audience: "owner" });
    if (sent) await prisma.shopPreview.update({ where: { id: preview.id }, data: { alertSentAt: new Date() } });
  } catch (error) {
    logWarn("preview.alert_failed", { previewId: preview.id, error: error instanceof Error ? error.message : "unknown" });
  }
}

export async function getPreviewStatus(token: string): Promise<PreviewStatus | null> {
  const row = await prisma.shopPreview.findUnique({ where: { token } });
  if (!row) return null;
  let capture: PreviewCapture | null = null;
  try {
    capture = row.lastCaptureJson ? (JSON.parse(row.lastCaptureJson) as PreviewCapture) : null;
  } catch {
    capture = null;
  }
  return {
    shopName: row.shopName,
    callsUsed: row.callsUsed,
    maxCalls: row.maxCalls,
    expiresAt: row.expiresAt.toISOString(),
    lastCallAt: row.lastCallAt?.toISOString() ?? null,
    summary: row.lastSummary,
    capture,
    alertSent: Boolean(row.alertSentAt),
  };
}
