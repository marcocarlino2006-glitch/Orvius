import { normalizePhone } from "@/lib/customer";
import { DEMO_OVERFLOW_SAY, demoDailyCeiling, demoVerdict, readDemoLoad, reserveDemoSlot } from "@/lib/demo-load";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { reserveShopLine, shopLineBusySay } from "@/lib/shop-machine";
import { CALLER_HOURLY_LIMIT, DEFAULT_SHOP_DAILY_CEILING } from "@/lib/usage-limits";
import { isUniqueViolation } from "@/lib/unique-violation";

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

export type SpendCut = {
  reason: "caller_repeat" | "shop_ceiling" | "shop_line" | "demo_live_cap" | "demo_daily_ceiling";
  say: string;
  count: number;
};

export async function callSpendCut(params: {
  shop: { id: string; name: string; ownerPhone: string | null; transferPhone: string | null };
  callerPhone: string | null;
  /** The public demo line: held to its own live-call cap and daily budget. */
  demo?: boolean;
  /** The demo call asking for a slot; without it the live cap falls back to a count. */
  vapiCallId?: string;
  /** A paying shop's own line: one call at a time, so another shop keeps its line. */
  ownsLine?: boolean;
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

  if (params.ownsLine && params.vapiCallId) {
    if (!(await reserveShopLine(params.shop.id, params.vapiCallId, now))) {
      logWarn("call.spend_cut", { businessId: params.shop.id, reason: "shop_line" });
      return { reason: "shop_line", say: shopLineBusySay(params.shop.name, Boolean(caller)), count: 1 };
    }
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

  A second caller on the shop's one line is not this kind of cut. holdLineBusyCaller
  keeps the number and tells the owner to call back. This stays quiet for that
  reason so the robodialer copy is never what they receive.
*/
export async function alertSpendCut(params: {
  shop: { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null };
  cut: SpendCut;
  callerPhone: string | null;
  now?: Date;
}) {
  if (params.cut.reason === "demo_live_cap" || params.cut.reason === "demo_daily_ceiling" || params.cut.reason === "shop_line") return null;
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

const BUSY_LINE_HOLD_MS = 2 * 60 * 60_000;

/**
 * The line was already in a call. Keep the number as a lead and tell the owner
 * to call back. Runs after the caller has been hung up, so it adds no voice latency.
 * A second call from the same number inside two hours reuses that lead.
 */
export async function holdLineBusyCaller(params: {
  shop: { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null };
  callerPhone: string | null;
  callId?: string | null;
  now?: Date;
}): Promise<{ leadId: string } | null> {
  const phone = normalizePhone(params.callerPhone);
  if (!phone) return null;
  const now = params.now ?? new Date();
  const phones = params.callerPhone && params.callerPhone !== phone ? [phone, params.callerPhone] : [phone];
  let lead = await prisma.lead.findFirst({
    where: {
      businessId: params.shop.id,
      source: "busy_line",
      phone: { in: phones },
      createdAt: { gte: new Date(now.getTime() - BUSY_LINE_HOLD_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!lead) {
    const data = {
      businessId: params.shop.id,
      phone,
      source: "busy_line",
      serviceType: "Called while the line was busy",
      notes: "The line was on another call. The number was kept so the shop can call back.",
      status: "new",
    };
    try {
      lead = await prisma.lead.create({
        data: { ...data, ...(params.callId ? { callId: params.callId } : {}) },
        select: { id: true },
      });
    } catch (error) {
      if (params.callId && isUniqueViolation(error)) {
        lead = await prisma.lead.create({ data, select: { id: true } });
      } else {
        logWarn("call.busy_line_lead_failed", {
          businessId: params.shop.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        lead = null;
      }
    }
  }
  await enqueueOwnerAlert({
    businessId: params.shop.id,
    ...(lead ? { leadId: lead.id } : {}),
    dedupeKey: `busy-line:${params.shop.id}:${phone}:${now.toISOString().slice(0, 13)}`,
    businessName: params.shop.name,
    message: `A caller reached ${params.shop.name} while the line was on another call. ${phone} is saved. Call them back.`,
    ownerPhone: params.shop.ownerPhone,
    ownerEmail: params.shop.ownerEmail,
  });
  return lead ? { leadId: lead.id } : null;
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
