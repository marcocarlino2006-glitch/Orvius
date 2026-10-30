import { createHash } from "node:crypto";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/unique-violation";

/**
 * A provider refusing a request Orvius built is a break on our side, not a bad
 * moment on theirs: a retired voice model failed every receptionist save for
 * ten days before anyone read the logs. The first refusal of a kind each day
 * emails the founders with the provider's own words; repeats only count up.
 */
export type Vendor = "vapi" | "twilio" | "resend";

const SOURCE = "orvius";
const EVENT_PREFIX = "vendor-alarm:";

/** 4xx means the provider read the request and refused it. Missing, conflicting and rate-limited requests are routine. */
export function isVendorBreak(status: number | null | undefined): boolean {
  if (typeof status !== "number") return false;
  return status >= 400 && status < 500 && ![404, 408, 409, 429].includes(status);
}

/** Same kind of refusal, whatever ids or numbers it names. */
export function alarmFingerprint(vendor: Vendor, operation: string, message: string): string {
  const shape = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "#")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "#")
    .replace(/\b[a-z]{2}[0-9a-f]{32}\b/g, "#")
    .replace(/\d+/g, "#")
    .slice(0, 200);
  return createHash("sha256").update(`${vendor}|${operation}|${shape}`).digest("hex").slice(0, 24);
}

const VENDOR_NAME: Record<Vendor, string> = { vapi: "Vapi (voice)", twilio: "Twilio (texts and lines)", resend: "Resend (email)" };

export function vendorAlarmEmail(params: { vendor: Vendor; operation: string; status: number; message: string; businessId?: string | null }) {
  return {
    subject: `Orvius alarm: ${VENDOR_NAME[params.vendor]} is refusing ${params.operation}`,
    text: [
      `${VENDOR_NAME[params.vendor]} refused a request Orvius sent (HTTP ${params.status}).`,
      "",
      `What: ${params.operation}`,
      params.businessId ? `First shop affected: ${params.businessId}` : "Not tied to one shop.",
      "",
      "Their words:",
      params.message.slice(0, 1200),
      "",
      "Repeats today are counted on the admin Launch tab, not emailed again.",
    ].join("\n"),
  };
}

const founderRecipients = () =>
  (process.env.ORVIUS_FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Never throws: an alarm that breaks the request it reports on would be worse than none. */
export async function raiseVendorAlarm(params: {
  vendor: Vendor;
  operation: string;
  status: number | null | undefined;
  message: string;
  businessId?: string | null;
  now?: Date;
}): Promise<"emailed" | "counted" | "logged" | "ignored"> {
  if (!isVendorBreak(params.status)) return "ignored";
  const status = params.status as number;
  const message = params.message.slice(0, 2000);
  const now = params.now ?? new Date();
  logError("vendor.refused", { vendor: params.vendor, operation: params.operation, status, businessId: params.businessId ?? null, error: message.slice(0, 300) });
  try {
    const externalId = `${today(now)}:${alarmFingerprint(params.vendor, params.operation, message)}`;
    const eventType = `${EVENT_PREFIX}${params.vendor}`;
    try {
      await prisma.webhookEvent.create({
        data: {
          source: SOURCE,
          externalId,
          eventType,
          status: "alarm",
          error: message,
          payloadJson: JSON.stringify({ operation: params.operation, status, businessId: params.businessId ?? null }),
          attempts: 1,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await prisma.webhookEvent.updateMany({ where: { source: SOURCE, externalId, eventType }, data: { attempts: { increment: 1 } } });
      return "counted";
    }
    const recipients = founderRecipients();
    // A broken email provider can't email about itself; the admin Launch tab still shows it.
    if (params.vendor === "resend" || !recipients.length || !isEmailConfigured()) return "logged";
    const email = vendorAlarmEmail({ ...params, status, message });
    for (const to of recipients) await sendOwnerEmail({ to, ...email });
    return "emailed";
  } catch (error) {
    logWarn("vendor.alarm_failed", { vendor: params.vendor, error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) });
    return "logged";
  }
}

export type VendorAlarmRow = {
  vendor: Vendor;
  operation: string;
  status: number;
  message: string;
  count: number;
  day: string;
  firstAt: string;
};

export async function recentVendorAlarms(days = 7, now = new Date()): Promise<VendorAlarmRow[]> {
  const rows = await prisma.webhookEvent.findMany({
    where: { source: SOURCE, eventType: { startsWith: EVENT_PREFIX }, createdAt: { gte: new Date(now.getTime() - days * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { eventType: true, externalId: true, error: true, payloadJson: true, attempts: true, createdAt: true },
  });
  return rows.map((row) => {
    let payload: { operation?: string; status?: number } = {};
    try {
      payload = JSON.parse(row.payloadJson ?? "{}");
    } catch {}
    return {
      vendor: row.eventType.slice(EVENT_PREFIX.length) as Vendor,
      operation: payload.operation ?? "request",
      status: payload.status ?? 0,
      message: (row.error ?? "").slice(0, 400),
      count: row.attempts,
      day: row.externalId.slice(0, 10),
      firstAt: row.createdAt.toISOString(),
    };
  });
}
