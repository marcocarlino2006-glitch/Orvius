import { Prisma } from "@prisma/client";
import { LIVE_CALL_WINDOW_MS, liveCallSince } from "@/lib/live-call";
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
  "Thanks for trying Orvius. A lot of people are calling the demo right now and every line is busy. Please try again in a few minutes, or watch how a call flows at orvius dot I M slash watch. Goodbye.";

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
      where: { businessId, status: "in-progress", createdAt: { gte: liveCallSince(now) }, ...PHONE_ONLY },
    }),
    prisma.call.count({ where: { businessId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) }, ...PHONE_ONLY } }),
  ]);
  return { live, today };
}

/** For the website: would a new call right now be turned away? */
export function demoLineBusyForVisitor(load: DemoLoad, limits = { cap: demoLiveCallCap(), ceiling: demoDailyCeiling() }) {
  return demoVerdict({ live: load.live + 1, today: load.today + 1 }, limits).busy;
}

/*
  Counting live calls and cutting the ones past the cap lets a burst through:
  every call that connects in the same second reads the same count. The cap
  is instead a fixed set of slots, each claimed by one call with a single
  conditional write, so N callers racing for the last slot get one winner.
  A slot is freed by the end-of-call report, or lapses after the longest a
  call can run, so a lost report can't hold it forever.
*/
const SLOT_PREFIX = "demo-line:slot:";
const slotTag = (vapiCallId: string) => `demo-call:${vapiCallId}`;

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function reserveDemoSlot(vapiCallId: string, now = new Date(), cap = demoLiveCallCap()): Promise<boolean> {
  const tag = slotTag(vapiCallId);
  const leaseUntil = new Date(now.getTime() + LIVE_CALL_WINDOW_MS);
  const mine = await prisma.provisionAttempt.findUnique({ where: { tag }, select: { key: true, leaseUntil: true } });
  if (mine?.key.startsWith(SLOT_PREFIX)) {
    if (mine.leaseUntil > now) return true;
    // This call held a slot before and let it go: re-arm that one, so the tag stays unique.
    const again = await prisma.provisionAttempt.updateMany({ where: { tag, leaseUntil: { lte: now } }, data: { status: "live", leaseUntil } });
    if (again.count) return true;
  }
  for (let i = 0; i < cap; i++) {
    const key = `${SLOT_PREFIX}${i}`;
    if (!(await prisma.provisionAttempt.findUnique({ where: { key }, select: { key: true } }))) {
      try {
        await prisma.provisionAttempt.create({ data: { key, tag, status: "live", leaseUntil } });
        return true;
      } catch (error) {
        if (!isUniqueClash(error)) throw error;
      }
    }
    try {
      const taken = await prisma.provisionAttempt.updateMany({
        where: { key, leaseUntil: { lte: now } },
        data: { tag, status: "live", leaseUntil, attempts: { increment: 1 } },
      });
      if (taken.count) return true;
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  return false;
}

export async function releaseDemoSlot(vapiCallId: string) {
  await prisma.provisionAttempt.updateMany({
    where: { tag: slotTag(vapiCallId), key: { startsWith: SLOT_PREFIX } },
    data: { status: "idle", leaseUntil: new Date(0) },
  });
}
