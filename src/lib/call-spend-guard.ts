import { normalizePhone } from "@/lib/customer";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/*
  Every answered minute is billed to Orvius by Vapi the moment it happens; the
  shop is invoiced for overage a month later, if its card works. A robodialer
  on one shop's number, or a shop line stuck in a call loop, is therefore an
  unbounded bill. Shop lines carry a fixed assistant, so Vapi never asks before
  answering — the cut happens on connect, through the live call control.

  The two limits sit far from real demand. Someone whose calls keep dropping
  redials a few times, but not eleven times in an hour; a busy shop takes 60 calls a day and a storm
  day perhaps 300, so 1,000 is a runaway, not a good day.
*/

export const CALLER_HOURLY_LIMIT = 10;
const DEFAULT_SHOP_DAILY_CEILING = 1_000;

export function shopDailyCallCeiling() {
  const raw = Number(process.env.ORVIUS_SHOP_DAILY_CALL_CEILING);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SHOP_DAILY_CEILING;
}

export type SpendCut = { reason: "caller_repeat" | "shop_ceiling"; say: string };

export async function callSpendCut(params: {
  shop: { id: string; name: string; ownerPhone: string | null; transferPhone: string | null };
  callerPhone: string | null;
  now?: Date;
}): Promise<SpendCut | null> {
  const now = params.now ?? new Date();
  const caller = normalizePhone(params.callerPhone);
  const ownPhones = new Set([params.shop.ownerPhone, params.shop.transferPhone].map(normalizePhone).filter(Boolean));

  if (caller && !ownPhones.has(caller)) {
    const lastHour = await prisma.call.count({
      where: {
        businessId: params.shop.id,
        callerPhone: { in: [caller, params.callerPhone!] },
        createdAt: { gte: new Date(now.getTime() - 60 * 60_000) },
      },
    });
    if (lastHour > CALLER_HOURLY_LIMIT) {
      logWarn("call.spend_cut", { businessId: params.shop.id, reason: "caller_repeat", lastHour });
      return {
        reason: "caller_repeat",
        say: `We've had several calls from this number in the last hour. The team at ${params.shop.name} has your number and will get back to you. Goodbye.`,
      };
    }
  }

  const dayStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const today = await prisma.call.count({ where: { businessId: params.shop.id, createdAt: { gte: dayStart } } });
  if (today > shopDailyCallCeiling()) {
    return {
      reason: "shop_ceiling",
      say: `Thanks for calling ${params.shop.name}. We're taking an unusual number of calls right now. Please call back shortly, or leave it with us and the team will reach you. Goodbye.`,
    };
  }
  return null;
}

/** Speak one sentence and hang up, through Vapi's live call control. */
export async function endCallWith(controlUrl: string, say: string) {
  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "say", content: say, endCallAfterSpoken: true }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch (error) {
    logWarn("call.spend_cut_failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
