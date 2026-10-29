import { Prisma } from "@prisma/client";
import { demoLiveCallCap } from "@/lib/demo-load";
import { LIVE_CALL_WINDOW_MS } from "@/lib/live-call";
import { prisma } from "@/lib/prisma";
import { webDemoCap } from "@/lib/web-demo";
import { isUniqueViolation } from "@/lib/unique-violation";

/*
  One call line per live shop. The demos keep a separate budget on the same
  voice account. A shop goes live only when a line is still free to hold for
  it, and a second caller on that shop waits rather than taking another shop's
  line. The purchased total is ORVIUS_VAPI_CALL_LINES — the number of
  simultaneous calls the voice account can actually carry. Until that number
  is recorded, checkout still opens. Once it is recorded, a new shop goes
  live only when a line is free. The owner stays on the same signup.
*/

export const LINES_PER_SHOP = 1;

export const LINE_NOT_RESERVED =
  "We're holding a call line for your shop. Your setup is saved. Checkout opens once that line is reserved.";

/** Spoken when this shop's one line is already in a call. A known number is a callback, not a hang-up. */
export function shopLineBusySay(shopName: string, hasNumber = false) {
  const next = hasNumber ? "We have your number and will call you back." : "Please try again in a few minutes.";
  return `Thanks for calling ${shopName}. This line is with another caller. ${next} Goodbye.`;
}

const envInt = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** Simultaneous calls the voice account was bought for. Unset means unknown. */
export function purchasedCallLines(env: NodeJS.ProcessEnv = process.env): number | null {
  return envInt(env.ORVIUS_VAPI_CALL_LINES);
}

/** Lines held back for the public phone demo and the browser demo. */
export function demoLineBudget(env: NodeJS.ProcessEnv = process.env): number {
  return demoLiveCallCap(env) + webDemoCap(env);
}

export type LinePlan = {
  purchased: number | null;
  demoBudget: number;
  shops: number;
  /** Lines already held by live shops. */
  shopLines: number;
  /** Lines still free for a new shop. Null when the purchase isn't recorded. */
  left: number | null;
};

export function linePlan(input: { purchased: number | null; demoBudget: number; shops: number }): LinePlan {
  const shops = Math.max(0, Math.floor(input.shops));
  const shopLines = shops * LINES_PER_SHOP;
  const left = input.purchased == null ? null : input.purchased - input.demoBudget - shopLines;
  return { purchased: input.purchased, demoBudget: input.demoBudget, shops, shopLines, left };
}

export function canReserveShopLine(plan: LinePlan): boolean {
  return plan.left != null && plan.left >= LINES_PER_SHOP;
}

/** Production shops whose receptionist and number are already on the voice account. */
export async function countShopsHoldingLines(): Promise<number> {
  return prisma.business.count({
    where: {
      environment: "production",
      vapiAssistantId: { not: null },
      OR: [{ twilioPhone: { not: null } }, { vapiPhoneNumber: { not: null } }],
    },
  });
}

export async function shopLineAvailability(env: NodeJS.ProcessEnv = process.env): Promise<LinePlan> {
  return linePlan({
    purchased: purchasedCallLines(env),
    demoBudget: demoLineBudget(env),
    shops: await countShopsHoldingLines(),
  });
}

const slotKey = (businessId: string) => `shop-line:${businessId}`;
const slotTag = (vapiCallId: string) => `shop-call:${vapiCallId}`;

const isUniqueClash = (error: unknown) => isUniqueViolation(error);

/**
 * Claim this shop's one line for this call. A second call loses while the
 * first still holds it. The hold lapses after the longest a call can run.
 */
export async function reserveShopLine(businessId: string, vapiCallId: string, now = new Date()): Promise<boolean> {
  const key = slotKey(businessId);
  const tag = slotTag(vapiCallId);
  const leaseUntil = new Date(now.getTime() + LIVE_CALL_WINDOW_MS);
  const mine = await prisma.provisionAttempt.findUnique({ where: { tag }, select: { key: true, leaseUntil: true } });
  if (mine?.key === key) {
    if (mine.leaseUntil > now) return true;
    const again = await prisma.provisionAttempt.updateMany({ where: { tag, leaseUntil: { lte: now } }, data: { status: "live", leaseUntil } });
    if (again.count) return true;
  }
  if (!(await prisma.provisionAttempt.findUnique({ where: { key }, select: { key: true } }))) {
    try {
      await prisma.provisionAttempt.create({ data: { key, tag, status: "live", leaseUntil, businessId } });
      return true;
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  try {
    const taken = await prisma.provisionAttempt.updateMany({
      where: { key, leaseUntil: { lte: now } },
      data: { tag, status: "live", leaseUntil, businessId, attempts: { increment: 1 } },
    });
    return taken.count > 0;
  } catch (error) {
    if (!isUniqueClash(error)) throw error;
    return false;
  }
}

export async function releaseShopLine(vapiCallId: string) {
  await prisma.provisionAttempt.updateMany({
    where: { tag: slotTag(vapiCallId), key: { startsWith: "shop-line:" } },
    data: { status: "idle", leaseUntil: new Date(0) },
  });
}
