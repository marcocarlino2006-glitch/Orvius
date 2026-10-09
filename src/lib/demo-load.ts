import { prisma } from "@/lib/prisma";

/*
  The public demo line shares one Vapi account, and one concurrency limit, with
  every paying shop. A post that takes off can put hundreds of people on the
  demo at once; past Vapi's limit the next call to anyone, a shop's customer
  included, is refused. So the demo is held below that limit and to its own
  daily budget, and a caller past either is told plainly where to see it work
  instead of hearing a dropped line.
*/

export const DEFAULT_DEMO_LIVE_CALL_CAP = 6;
export const DEFAULT_DEMO_DAILY_CEILING = 1500;
/** A demo call is ended by the assistant at 10 minutes, so anything older is a lost end-of-call report. */
const LIVE_WINDOW_MS = 11 * 60_000;

const envInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export function demoLiveCallCap(env: NodeJS.ProcessEnv = process.env) {
  return envInt(env.ORVIUS_DEMO_MAX_LIVE_CALLS, DEFAULT_DEMO_LIVE_CALL_CAP);
}

export function demoDailyCeiling(env: NodeJS.ProcessEnv = process.env) {
  return envInt(env.ORVIUS_DEMO_DAILY_CALL_CEILING, DEFAULT_DEMO_DAILY_CEILING);
}

export const DEMO_OVERFLOW_SAY =
  "Thanks for trying Orvius. A lot of people are calling the demo right now and every line is busy. Please try again in a few minutes, or watch a real call at orvius dot I M slash watch. Goodbye.";

export type DemoLoad = { live: number; today: number };
export type DemoVerdict = { busy: false } | { busy: true; reason: "demo_live_cap" | "demo_daily_ceiling" };

/** `live` and `today` include the call being decided. */
export function demoVerdict(load: DemoLoad, limits = { cap: demoLiveCallCap(), ceiling: demoDailyCeiling() }): DemoVerdict {
  if (load.live > limits.cap) return { busy: true, reason: "demo_live_cap" };
  if (load.today > limits.ceiling) return { busy: true, reason: "demo_daily_ceiling" };
  return { busy: false };
}

/* Browser demo calls wait in their own line (web-demo.ts) and don't use the phone line's slots. */
const PHONE_ONLY = { OR: [{ channel: null }, { channel: { not: "web_demo" } }] };

export async function readDemoLoad(businessId: string, now = new Date()): Promise<DemoLoad> {
  const [live, today] = await Promise.all([
    prisma.call.count({
      where: { businessId, status: "in-progress", createdAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) }, ...PHONE_ONLY },
    }),
    prisma.call.count({ where: { businessId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) }, ...PHONE_ONLY } }),
  ]);
  return { live, today };
}

/** For the website: would a new call right now be turned away? */
export function demoLineBusyForVisitor(load: DemoLoad, limits = { cap: demoLiveCallCap(), ceiling: demoDailyCeiling() }) {
  return demoVerdict({ live: load.live + 1, today: load.today + 1 }, limits).busy;
}
