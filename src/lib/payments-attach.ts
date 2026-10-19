import { prisma } from "@/lib/prisma";
import { COLLECTED_STATUSES } from "@/lib/payment-math";

export type PaymentsAttach = {
  productionShops: number;
  shopsCollecting: number;
  collectedKeptCents: number;
  openBilledCents: number;
};

/**
 * Money through Orvius, honestly bounded: kept recorded payments and paid
 * deposits (gross less refunds) across production shops, how many of those
 * shops collect anything through the platform at all, and what is billed
 * but still open. What shops collect outside Orvius is not visible and is
 * never estimated here — the gap is the attach opportunity, shown as two
 * real numbers rather than one invented one.
 */
export async function getPaymentsAttach(client = prisma): Promise<PaymentsAttach> {
  const shops = await client.business.findMany({
    where: { environment: "production" },
    select: { id: true },
  });
  const ids = shops.map((shop) => shop.id);
  if (!ids.length) return { productionShops: 0, shopsCollecting: 0, collectedKeptCents: 0, openBilledCents: 0 };
  const [payments, deposits, invoices] = await Promise.all([
    client.payment.findMany({
      where: { businessId: { in: ids }, status: { in: [...COLLECTED_STATUSES, "refunded"] } },
      select: { businessId: true, amountCents: true, refundedCents: true },
    }),
    client.deposit.findMany({
      where: { businessId: { in: ids }, status: { in: ["paid", "refunded"] } },
      select: { businessId: true, amountCents: true, refundedCents: true },
    }),
    client.invoice.findMany({
      where: { businessId: { in: ids }, status: { in: ["draft", "sent", "open"] } },
      select: { amountCents: true },
    }),
  ]);
  const collecting = new Set<string>();
  let kept = 0;
  for (const row of [...payments, ...deposits]) {
    kept += Math.max(0, row.amountCents - (row.refundedCents ?? 0));
    if (row.amountCents > 0) collecting.add(row.businessId);
  }
  return {
    productionShops: ids.length,
    shopsCollecting: collecting.size,
    collectedKeptCents: kept,
    openBilledCents: invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0),
  };
}
