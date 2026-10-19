import { Prisma } from "@prisma/client";
import { isMoneySchemaDrift } from "@/lib/command-degraded";
import { COLLECTED_STATUSES } from "@/lib/payment-math";
import { prisma } from "@/lib/prisma";
import { can, listShopAccess, type ShopRole } from "@/lib/workspace-access";

export type PortfolioShop = {
  id: string;
  name: string;
  role: ShopRole;
  trade: string | null;
  calls: number;
  leads: number;
  booked: number;
  completed: number;
  /** Null where this person's role can't see the shop's money. */
  collectedCents: number | null;
  /** Leads still waiting on a first callback, at any age. */
  waiting: number;
  waitingEmergencies: number;
  lastCallAt: string | null;
  lineLive: boolean;
  lineVerified: boolean;
  billingStatus: string;
};

export type Portfolio = {
  days: number;
  since: string;
  /** Money reads paused (database behind the release); collectedCents is null per shop, never zeroed. */
  moneyPaused: boolean;
  shops: PortfolioShop[];
  /** More locations than one page shows; totals cover only the ones listed. */
  truncated: boolean;
  totals: Omit<PortfolioShop, "id" | "name" | "role" | "trade" | "lastCallAt" | "lineLive" | "lineVerified" | "billingStatus"> & {
    locations: number;
    linesDown: number;
  };
};

const MAX_SHOPS = 200;

const countBy = (rows: Array<{ businessId: string | null; _count: { _all: number } }>) =>
  new Map(rows.map((r) => [r.businessId ?? "", r._count._all]));
/** Money kept per shop: receipts less any partial refunds recorded on them. */
const sumBy = (rows: Array<{ businessId: string | null; _sum: { amountCents: number | null; refundedCents?: number | null } }>) =>
  new Map(rows.map((r) => [r.businessId ?? "", (r._sum.amountCents ?? 0) - (r._sum.refundedCents ?? 0)]));

/**
 * Every location one person can open, side by side, over the same window.
 * One grouped query per metric across all shops, so fifty locations cost the
 * same round trips as one.
 */
export async function getPortfolio(email: string, days: number, now = new Date()): Promise<Portfolio> {
  const window = [7, 30, 90].includes(days) ? days : 7;
  const since = new Date(now.getTime() - window * 86_400_000);
  const all = await listShopAccess(email);
  const access = all.slice(0, MAX_SHOPS);
  const ids = access.map((a) => a.business.id);
  const inShops = { businessId: { in: ids } };

  const [calls, leads, booked, completed, waiting, waitingEmergencies, lastCalls] = ids.length
    ? await Promise.all([
        prisma.call.groupBy({ by: ["businessId"], where: { ...inShops, direction: "inbound", createdAt: { gte: since } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["businessId"], where: { ...inShops, status: { not: "spam" }, createdAt: { gte: since } }, _count: { _all: true } }),
        prisma.job.groupBy({ by: ["businessId"], where: { ...inShops, createdAt: { gte: since } }, _count: { _all: true } }),
        prisma.job.groupBy({ by: ["businessId"], where: { ...inShops, completedAt: { gte: since } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["businessId"], where: { ...inShops, status: "new" }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["businessId"], where: { ...inShops, status: "new", urgency: "emergency" }, _count: { _all: true } }),
        // Prisma writes DateTime as epoch ms; a row written by a SQL default holds text, which SQLite sorts above every
        // number, so MAX would return it and fail to decode. Only Prisma-written values count.
        prisma.$queryRaw<Array<{ businessId: string; lastAt: number | bigint | null }>>`
          SELECT "businessId", MAX(CASE WHEN typeof("createdAt") = 'integer' THEN "createdAt" END) AS "lastAt"
          FROM "Call" WHERE "direction" = 'inbound' AND "businessId" IN (${Prisma.join(ids)}) GROUP BY "businessId"`,
      ])
    : [[], [], [], [], [], [], []];

  /* Refund columns are the one read that can be ahead of the database;
     pause money (null per shop below) and keep every count exact. */
  const moneyRows = ids.length
    ? await Promise.all([
        prisma.deposit.groupBy({ by: ["businessId"], where: { ...inShops, status: "paid", paidAt: { gte: since } }, _sum: { amountCents: true, refundedCents: true } }),
        prisma.payment.groupBy({
          by: ["businessId"],
          where: { ...inShops, createdAt: { gte: since }, status: { in: COLLECTED_STATUSES } },
          _sum: { amountCents: true, refundedCents: true },
        }),
      ]).catch((error: unknown) => {
        if (isMoneySchemaDrift(error)) return null;
        throw error;
      })
    : null;
  const moneyPaused = ids.length > 0 && moneyRows === null;
  const deposits = moneyRows?.[0] ?? [];
  const invoices = moneyRows?.[1] ?? [];

  const m = {
    calls: countBy(calls),
    leads: countBy(leads),
    booked: countBy(booked),
    completed: countBy(completed),
    deposits: sumBy(deposits),
    invoices: sumBy(invoices),
    waiting: countBy(waiting),
    waitingEmergencies: countBy(waitingEmergencies),
    lastCall: new Map(lastCalls.map((r) => [r.businessId, r.lastAt == null ? null : new Date(Number(r.lastAt))])),
  };

  const shops: PortfolioShop[] = access.map(({ business: b, role }) => ({
    id: b.id,
    name: b.name,
    role,
    trade: b.trade ?? null,
    calls: m.calls.get(b.id) ?? 0,
    leads: m.leads.get(b.id) ?? 0,
    booked: m.booked.get(b.id) ?? 0,
    completed: m.completed.get(b.id) ?? 0,
    collectedCents: can(role, "reports.view") && !moneyPaused ? (m.deposits.get(b.id) ?? 0) + (m.invoices.get(b.id) ?? 0) : null,
    waiting: m.waiting.get(b.id) ?? 0,
    waitingEmergencies: m.waitingEmergencies.get(b.id) ?? 0,
    lastCallAt: m.lastCall.get(b.id)?.toISOString() ?? null,
    lineLive: Boolean(b.vapiPhoneNumber || b.twilioPhone),
    lineVerified: Boolean(b.lineVerifiedAt),
    billingStatus: b.billingStatus ?? "none",
  }));

  const sum = (k: "calls" | "leads" | "booked" | "completed" | "waiting" | "waitingEmergencies") =>
    shops.reduce((t, s) => t + s[k], 0);
  // A total over only some shops would read as the whole business, so it shows only when every shop's money is visible.
  const collectedTotal = shops.every((s) => s.collectedCents != null) ? shops.reduce((t, s) => t + (s.collectedCents ?? 0), 0) : null;
  return {
    days: window,
    since: since.toISOString(),
    moneyPaused,
    shops,
    truncated: all.length > access.length,
    totals: {
      locations: shops.length,
      linesDown: shops.filter((s) => !s.lineLive).length,
      calls: sum("calls"),
      leads: sum("leads"),
      booked: sum("booked"),
      completed: sum("completed"),
      collectedCents: collectedTotal,
      waiting: sum("waiting"),
      waitingEmergencies: sum("waitingEmergencies"),
    },
  };
}
