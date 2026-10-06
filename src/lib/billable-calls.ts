import type { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

/*
  What a shop is billed for is a customer call the receptionist handled. The
  owner ringing their own line to hear it work is not one, a hang-up before
  anyone spoke is not one, and a call the shop marked spam is not one. Billing
  those made a careful owner pay for testing and a robocalled shop pay for the
  robocaller. The meter, the 80%/100% texts and the overage invoice all count
  through here, so the number an owner sees is the number they pay for.
*/

/** Shorter than this, nobody got as far as saying what they needed. */
export const MIN_BILLABLE_SECONDS = 15;

export function billableCallWhere(
  shop: { id: string; ownerPhone?: string | null; transferPhone?: string | null },
  window: { gte: Date; lt?: Date },
): Prisma.CallWhereInput {
  const own = [...new Set([shop.ownerPhone, shop.transferPhone].flatMap((p) => [p?.trim(), normalizePhone(p)]))].filter(
    (p): p is string => Boolean(p),
  );
  return {
    businessId: shop.id,
    direction: "inbound",
    createdAt: window,
    AND: [
      // Explicit null arms: NOT IN and < against a NULL column would silently drop the row.
      ...(own.length ? [{ OR: [{ callerPhone: null }, { callerPhone: { notIn: own } }] }] : []),
      { OR: [{ durationSec: null }, { durationSec: { gte: MIN_BILLABLE_SECONDS } }] },
      { OR: [{ lead: { is: null } }, { lead: { is: { status: { not: "spam" } } } }] },
    ],
  };
}

export function countBillableCalls(
  shop: { id: string; ownerPhone?: string | null; transferPhone?: string | null },
  window: { gte: Date; lt?: Date },
) {
  return prisma.call.count({ where: billableCallWhere(shop, window) });
}
