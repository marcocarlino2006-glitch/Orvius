import { createHash, createHmac } from "node:crypto";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/*
  Every step from the pricing page to a paid shop, counted without cookies,
  local storage or a stored address. A signed-in owner is a hash of their
  email, so the steps after sign-in join up across devices; a visitor before
  sign-in is a hash of address, browser and a key that changes every day, so
  the same visitor tomorrow is a stranger and nobody can be followed across
  days. Do Not Track and Global Privacy Control are not counted at all.
*/

export const FUNNEL_STEPS = [
  { event: "pricing", label: "Saw pricing" },
  { event: "signup", label: "Opened sign-up" },
  { event: "setup", label: "Opened setup" },
  { event: "shop_named", label: "Named their shop" },
  { event: "heard", label: "Heard it answer" },
  { event: "pay", label: "Reached the pay step" },
  { event: "checkout", label: "Started checkout" },
  { event: "paid", label: "Paid" },
] as const;

export type FunnelEventName = (typeof FUNNEL_STEPS)[number]["event"];

/** Steps a browser may report. The rest are recorded by the server where they happen, so they can't be faked. */
export const BEACON_EVENTS: readonly FunnelEventName[] = ["pricing", "signup", "setup", "pay"];

const EVENTS = new Set<string>(FUNNEL_STEPS.map((s) => s.event));

export function isFunnelEvent(value: unknown): value is FunnelEventName {
  return typeof value === "string" && EVENTS.has(value);
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|node-fetch|axios/i;

export function isBot(userAgent: string | null | undefined) {
  return !userAgent || BOT.test(userAgent);
}

export function optedOutOfTracking(headers: Headers) {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
}

function key() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "orvius-funnel";
}

export function ownerWho(email: string) {
  return `o:${createHmac("sha256", key()).update(`funnel-owner:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 22)}`;
}

export function visitorWho(ip: string, userAgent: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const dailyKey = createHmac("sha256", key()).update(`funnel-day:${day}`).digest();
  return `v:${createHash("sha256").update(dailyKey).update(`${ip}\n${userAgent}`).digest("base64url").slice(0, 22)}`;
}

/** Never throws and never slows the step it measures: a missing table or a slow write only loses the count. */
export async function recordFunnel(event: FunnelEventName, who: string, detail?: string | null) {
  try {
    await prisma.funnelEvent.create({ data: { event, who, detail: detail?.slice(0, 40) || null } });
  } catch (error) {
    logWarn("funnel.record_failed", { event, error: error instanceof Error ? error.message : String(error) });
  }
}

export function recordOwnerStep(event: FunnelEventName, email: string | null | undefined, detail?: string | null) {
  if (!email?.trim()) return Promise.resolve();
  return recordFunnel(event, ownerWho(email), detail);
}

export type FunnelRow = { event: FunnelEventName; label: string; people: number; fromPrevious: number | null };

/** People per step over the window, and how many of the step before reached it. */
export function funnelRows(counts: Partial<Record<FunnelEventName, number>>): FunnelRow[] {
  return FUNNEL_STEPS.map((step, index) => {
    const people = counts[step.event] ?? 0;
    const before = index ? counts[FUNNEL_STEPS[index - 1].event] ?? 0 : 0;
    return {
      event: step.event,
      label: step.label,
      people,
      fromPrevious: index && before ? Math.round((people / before) * 100) : null,
    };
  });
}

export async function readFunnel(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const pairs = await prisma.funnelEvent.groupBy({ by: ["event", "who"], where: { createdAt: { gte: since } } });
    const counts: Partial<Record<FunnelEventName, number>> = {};
    for (const pair of pairs) if (isFunnelEvent(pair.event)) counts[pair.event] = (counts[pair.event] ?? 0) + 1;
    return { ready: true as const, days, rows: funnelRows(counts) };
  } catch {
    return { ready: false as const, days, rows: funnelRows({}) };
  }
}
