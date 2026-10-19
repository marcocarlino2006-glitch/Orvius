import { normalizePhone } from "@/lib/customer";
import { DEMO_OVERFLOW_SAY, demoDailyCeiling, demoVerdict, readDemoLoad, reserveDemoSlot } from "@/lib/demo-load";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { CALLER_HOURLY_LIMIT, DEFAULT_SHOP_DAILY_CEILING } from "@/lib/usage-limits";

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

export { CALLER_HOURLY_LIMIT };

export function shopDailyCallCeiling() {
  const raw = Number(process.env.ORVIUS_SHOP_DAILY_CALL_CEILING);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SHOP_DAILY_CEILING;
}

export type SpendCut = { reason: "caller_repeat" | "shop_ceiling" | "demo_live_cap" | "demo_daily_ceiling"; say: string; count: number };

export async function callSpendCut(params: {
  shop: { id: string; name: string; ownerPhone: string | null; transferPhone: string | null };
  callerPhone: string | null;
  /** The public demo line: held to its own live-call cap and daily budget. */
  demo?: boolean;
  /** The demo call asking for a slot; without it the live cap falls back to a count. */
  vapiCallId?: string;
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
        count: lastHour,
      };
    }
  }

  if (params.demo && params.vapiCallId) {
    const load = await readDemoLoad(params.shop.id, now);
    if (load.today > demoDailyCeiling()) {
      logWarn("call.spend_cut", { businessId: params.shop.id, reason: "demo_daily_ceiling" });
      return { reason: "demo_daily_ceiling", say: DEMO_OVERFLOW_SAY, count: load.today };
    }
    if (await reserveDemoSlot(params.vapiCallId, now)) return null;
    logWarn("call.spend_cut", { businessId: params.shop.id, reason: "demo_live_cap" });
    return { reason: "demo_live_cap", say: DEMO_OVERFLOW_SAY, count: load.live };
  }

  if (params.demo) {
    const load = await readDemoLoad(params.shop.id, now);
    const verdict = demoVerdict(load);
    if (!verdict.busy) return null;
    logWarn("call.spend_cut", { businessId: params.shop.id, reason: verdict.reason });
    return { reason: verdict.reason, say: DEMO_OVERFLOW_SAY, count: verdict.reason === "demo_live_cap" ? load.live : load.today };
  }

  const dayStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const today = await prisma.call.count({ where: { businessId: params.shop.id, createdAt: { gte: dayStart } } });
  if (today > shopDailyCallCeiling()) {
    return {
      reason: "shop_ceiling",
      say: `Thanks for calling ${params.shop.name}. We're taking an unusual number of calls right now. Please call back shortly, or leave it with us and the team will reach you. Goodbye.`,
      count: today,
    };
  }
  return null;
}

/*
  A cut that ends a paying shop's call without the owner knowing is a caller
  lost, not money saved: the caller heard "we'll get back to you" from a
  machine, and nobody's number lights up. The demo line needs no alert — the
  platform page already covers it — but a shop cut pages the owner once per
  hour (repeat caller) or once per day (runaway line), so the second, third,
  and fiftieth cut stay silent while the first is actionable.
*/
export async function alertSpendCut(params: {
  shop: { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null };
  cut: SpendCut;
  callerPhone: string | null;
  now?: Date;
}) {
  if (params.cut.reason === "demo_live_cap" || params.cut.reason === "demo_daily_ceiling") return null;
  const now = params.now ?? new Date();
  const tail = (normalizePhone(params.callerPhone) ?? "").slice(-4) || "unknown";
  const bucket = params.cut.reason === "caller_repeat" ? now.toISOString().slice(0, 13) : now.toISOString().slice(0, 10);
  const message =
    params.cut.reason === "caller_repeat"
      ? `Orvius ended a call from (…${tail}) — ${params.cut.count} calls from that number in the last hour, past the repeat-caller guard. Their number is in today's calls; call back if it's real, ignore it if it's a robodialer.`
      : `Orvius ended an inbound call — ${params.cut.count} calls in the last 24 hours, past the runaway-line guard (a busy day is far below this). Callers were told to try again shortly. If the line is stuck in a loop, check Vapi; otherwise no action needed.`;
  return enqueueOwnerAlert({
    businessId: params.shop.id,
    dedupeKey: `spend-cut:${params.cut.reason}:${params.shop.id}:${bucket}`,
    businessName: params.shop.name,
    message,
    ownerPhone: params.shop.ownerPhone,
    ownerEmail: params.shop.ownerEmail,
  });
}

/** Speak one sentence and hang up, through Vapi's live call control. One retry: a burst of cuts should not drown the line in retries. */
export async function endCallWith(controlUrl: string, say: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(controlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "say", content: say, endCallAfterSpoken: true }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return true;
    } catch {
      /* Retry once below. */
    }
  }
  logWarn("call.spend_cut_failed", {});
  return false;
}
