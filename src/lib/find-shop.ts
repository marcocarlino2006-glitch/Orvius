import { recordAudit } from "@/lib/audit";
import { isLineEntitled, isBillingEntitled } from "@/lib/billing-entitlement";
import { linkTouchToCustomer, normalizePhone, displayPhone } from "@/lib/customer";
import { deriveDemandSignal } from "@/lib/demand-capture";
import { relationMissing } from "@/lib/find-schema";
import { zip3FromAddress } from "@/lib/network-density";
import { getShopLine } from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import { referralLink } from "@/lib/referrals";
import { LAUNCH_TRADES, isTrade, type Trade } from "@/lib/trades";
import { reviewLine, reviewScores, type ReviewScore } from "@/lib/visit-review";

/**
 * How a customer finds a shop, and how a shop sees the area it is in.
 * A shop is listed when its line answers, it is a launch trade, and its ZIP
 * is the one the customer asked for. A test shop, a shop with no number,
 * and a shop whose line is off stay out.
 */

export type FindQuery = { trade: Trade; zip3: string };

export function parseFindQuery(input: { trade?: string | null; zip?: string | null }): FindQuery | null {
  const trade = (input.trade ?? "").trim();
  const match = LAUNCH_TRADES.find((item) => item.toLowerCase() === trade.toLowerCase());
  if (!match || !isTrade(match)) return null;
  const digits = (input.zip ?? "").replace(/\D/g, "");
  const zip = digits.length >= 5 ? digits.slice(0, 5) : digits.length === 3 ? digits : "";
  if (!zip) return null;
  if (zip.length === 5) {
    const value = Number(zip);
    if (value < 501 || value > 99950) return null;
  }
  return { trade: match, zip3: zip.slice(0, 3) };
}

type ListedShop = {
  id: string;
  name: string;
  slug: string;
  trade: string | null;
  address: string | null;
  networkZip3: string | null;
  networkOn: boolean;
  serviceZipsJson: string | null;
  bookingPageOn: boolean;
  environment: string;
  isActive: boolean;
  billingStatus: string;
  pilotEndsAt: Date | null;
  createdAt: Date;
  pastDueSince: Date | null;
  pauseStartsAt: Date | null;
  pausedUntil: Date | null;
  vapiPhoneNumber: string | null;
  twilioPhone: string | null;
};

function shopZip3(shop: Pick<ListedShop, "networkZip3" | "address" | "serviceZipsJson">): string | null {
  if (shop.networkZip3 && /^\d{3}$/.test(shop.networkZip3)) return shop.networkZip3;
  return zip3FromAddress(shop.address) ?? zip3FromAddress(shop.serviceZipsJson);
}

function listable(shop: ListedShop, now: Date): boolean {
  if (!shop.isActive || shop.environment !== "production") return false;
  if (!shop.trade || !isTrade(shop.trade) || !(LAUNCH_TRADES as readonly string[]).includes(shop.trade)) return false;
  if (!getShopLine(shop)) return false;
  return isLineEntitled(shop, now);
}

export type FoundShop = {
  name: string;
  trade: string;
  slug: string;
  phone: string;
  phoneDisplay: string;
  bookingPath: string | null;
  area: string;
  reviews: ReviewScore | null;
  reviewLine: string | null;
};

const SHOP_SELECT = {
  id: true,
  name: true,
  slug: true,
  trade: true,
  address: true,
  networkZip3: true,
  networkOn: true,
  serviceZipsJson: true,
  bookingPageOn: true,
  environment: true,
  isActive: true,
  billingStatus: true,
  pilotEndsAt: true,
  createdAt: true,
  pastDueSince: true,
  pauseStartsAt: true,
  pausedUntil: true,
  vapiPhoneNumber: true,
  twilioPhone: true,
} as const;

export async function findShops(query: FindQuery, now = new Date()): Promise<FoundShop[]> {
  const rows = await prisma.business.findMany({
    where: {
      environment: "production",
      isActive: true,
      trade: query.trade,
      OR: [
        { networkZip3: query.zip3 },
        { address: { contains: query.zip3 } },
        { serviceZipsJson: { contains: query.zip3 } },
      ],
    },
    select: SHOP_SELECT,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const matched = rows.filter((shop) => shopZip3(shop) === query.zip3 && listable(shop, now));
  let scores = new Map<string, ReviewScore>();
  try {
    scores = await reviewScores(matched.map((shop) => shop.id));
  } catch (error) {
    if (!relationMissing(error, "VisitReview")) throw error;
  }
  return matched
    .map((shop) => {
      const phone = getShopLine(shop)!;
      const reviews = scores.get(shop.id) ?? null;
      const booking = shop.bookingPageOn && isBillingEntitled(shop, now);
      return {
        name: shop.name,
        trade: shop.trade!,
        slug: shop.slug,
        phone,
        phoneDisplay: displayPhone(phone),
        bookingPath: booking ? `/b/${shop.slug}` : null,
        area: `${query.zip3}xx`,
        reviews,
        reviewLine: reviewLine(reviews),
      };
    })
    .sort((a, b) => (b.reviews?.count ?? 0) - (a.reviews?.count ?? 0) || (b.reviews?.average ?? 0) - (a.reviews?.average ?? 0) || a.name.localeCompare(b.name));
}

export type WaitingRequest = { id: string; name: string; phone: string; need: string; createdAt: string };

export type ShopArea = {
  trade: string | null;
  zip3: string | null;
  listed: boolean;
  hasLine: boolean;
  lineLive: boolean;
  networkOn: boolean;
  others: number;
  networkPartners: number;
  findPath: string | null;
  inviteUrl: string | null;
  waiting: WaitingRequest[];
};

export function areaCopy(area: ShopArea): string[] {
  if (!area.trade || !area.zip3) {
    return ["Add the shop address with its ZIP so people in your area can find you."];
  }
  const place = `${area.zip3}xx`;
  const lines: string[] = [];
  if (area.listed) lines.push(`Customers searching ${area.trade} in ${place} find this shop.`);
  else if (!area.hasLine) lines.push("A number has to be answering before customers can find this shop.");
  else if (!area.lineLive) lines.push("This shop isn't on a live plan, so it stays out of search.");
  else lines.push(`This shop isn't in search for ${area.trade} in ${place} yet.`);
  if (area.others === 0) lines.push(`No other ${area.trade} shop in ${place} answers on Orvius yet.`);
  else lines.push(`${area.others} other ${area.trade} ${area.others === 1 ? "shop answers" : "shops answer"} in ${place}.`);
  if (area.networkOn && area.networkPartners > 0) {
    lines.push(
      `${area.networkPartners === 1 ? "One can" : `${area.networkPartners} can`} take a job this shop can't. The caller is asked before anything is shared.`,
    );
  } else if (!area.networkOn && area.networkPartners > 0) {
    lines.push("Turn the network on and a job this shop can't take can go to one of them. The caller is asked first.");
  } else if (area.inviteUrl) {
    lines.push(`Send the next ${area.trade} shop this link so a job you can't take has somewhere to go.`);
  }
  if (area.waiting.length) {
    lines.push(
      `${area.waiting.length} ${area.waiting.length === 1 ? "person asked" : "people asked"} for a ${area.trade} shop in ${place}.`,
    );
  }
  return lines;
}

export async function shopArea(businessId: string, now = new Date()): Promise<ShopArea> {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: SHOP_SELECT });
  if (!shop) {
    return {
      trade: null,
      zip3: null,
      listed: false,
      hasLine: false,
      lineLive: false,
      networkOn: false,
      others: 0,
      networkPartners: 0,
      findPath: null,
      inviteUrl: null,
      waiting: [],
    };
  }
  const trade = shop.trade && isTrade(shop.trade) ? shop.trade : null;
  const zip3 = shopZip3(shop);
  const hasLine = Boolean(getShopLine(shop));
  const lineLive = isLineEntitled(shop, now);
  const listed = listable(shop, now) && zip3 != null;
  const query = trade && zip3 && LAUNCH_TRADES.includes(trade) ? { trade, zip3 } : null;
  const found = query ? await findShops(query, now) : [];
  const others = found.filter((row) => row.slug !== shop.slug);
  const partnerRows = query
    ? (
        await prisma.business.findMany({
          where: { environment: "production", isActive: true, trade: query.trade, networkOn: true, id: { not: shop.id } },
          select: SHOP_SELECT,
          take: 100,
        })
      ).filter((row) => shopZip3(row) === query.zip3 && listable(row, now))
    : [];
  let waiting: { id: string; name: string; phone: string; need: string; createdAt: Date }[] = [];
  if (query) {
    try {
      waiting = await prisma.areaRequest.findMany({
        where: { trade: query.trade, zip3: query.zip3, claimedAt: null },
        orderBy: { createdAt: "asc" },
        take: 8,
        select: { id: true, name: true, phone: true, need: true, createdAt: true },
      });
    } catch (error) {
      if (!relationMissing(error, "AreaRequest")) throw error;
    }
  }
  const invite =
    query && shop.slug && partnerRows.length === 0
      ? `${referralLink(shop.slug)}?via=network&trade=${encodeURIComponent(query.trade)}&zip=${encodeURIComponent(query.zip3)}`
      : null;
  return {
    trade,
    zip3,
    listed,
    hasLine,
    lineLive,
    networkOn: shop.networkOn,
    others: others.length,
    networkPartners: partnerRows.length,
    findPath: query ? `/find?trade=${encodeURIComponent(query.trade)}&zip=${query.zip3}` : null,
    inviteUrl: invite,
    waiting: listed
      ? waiting.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
      : [],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveAreaRequest(input: {
  trade: string;
  zip: string;
  name: string;
  phone: string;
  need: string;
  now?: Date;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; status?: number }> {
  const query = parseFindQuery({ trade: input.trade, zip: input.zip });
  if (!query) return { ok: false, error: "Choose HVAC, plumbing or electrical, and a ZIP code." };
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Add your name." };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "Add a mobile number the shop can call." };
  const need = input.need.trim().slice(0, 400);
  if (need.length < 8) return { ok: false, error: "Say what you need done, in a sentence." };
  const now = input.now ?? new Date();
  try {
    const recent = await prisma.areaRequest.findFirst({
      where: { trade: query.trade, zip3: query.zip3, phone, claimedAt: null, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      select: { id: true },
    });
    if (recent) return { ok: true, id: recent.id };
    const row = await prisma.areaRequest.create({
      data: { trade: query.trade, zip3: query.zip3, name, phone, need },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (error) {
    if (relationMissing(error, "AreaRequest")) {
      return { ok: false, error: "Orvius couldn't take that yet. Try again in a few minutes.", status: 503 };
    }
    throw error;
  }
}

export class AreaClaimError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** The first listed shop in that trade and ZIP to take an open request gets the lead. */
export async function claimAreaRequest(params: { businessId: string; requestId: string; now?: Date }) {
  const now = params.now ?? new Date();
  const area = await shopArea(params.businessId, now);
  if (!area.listed || !area.trade || !area.zip3) {
    throw new AreaClaimError("This shop isn't in search for that area yet.", 409);
  }
  let open: Awaited<ReturnType<typeof prisma.areaRequest.findFirst>> | undefined;
  try {
    open = await prisma.areaRequest.findFirst({
      where: { id: params.requestId, trade: area.trade, zip3: area.zip3, claimedAt: null },
    });
  } catch (error) {
    if (relationMissing(error, "AreaRequest")) {
      throw new AreaClaimError("Orvius couldn't take that yet. Try again in a few minutes.", 503);
    }
    throw error;
  }
  if (!open) throw new AreaClaimError("That request is already with a shop.", 409);

  const demand = deriveDemandSignal({
    serviceType: open.need,
    notes: open.need,
    address: open.zip3,
    trade: isTrade(area.trade) ? area.trade : null,
  });
  const lead = await prisma.$transaction(async (tx) => {
    const won = await tx.areaRequest.updateMany({
      where: { id: open.id, claimedAt: null },
      data: { claimedById: params.businessId, claimedAt: now },
    });
    if (!won.count) throw new AreaClaimError("That request is already with a shop.", 409);
    const created = await tx.lead.create({
      data: {
        businessId: params.businessId,
        name: open.name,
        phone: open.phone,
        serviceType: open.need.slice(0, 120),
        notes: `Asked Orvius for a ${open.trade} shop in ${open.zip3}xx. ${open.need}`,
        categoryCode: demand.categoryCode,
        postalCode: demand.postalCode,
        source: "find",
        status: "new",
      },
    });
    await tx.areaRequest.update({ where: { id: open.id }, data: { leadId: created.id } });
    return created;
  });

  await linkTouchToCustomer({
    businessId: params.businessId,
    leadId: lead.id,
    phone: open.phone,
    name: open.name,
    notes: open.need,
  }).catch(() => null);
  await recordAudit({
    businessId: params.businessId,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
    action: "find.claimed",
    actor: "owner",
    summary: `Took ${open.name}'s request for a ${open.trade} shop in ${open.zip3}xx`,
    idempotencyKey: `find-claimed:${open.id}`,
  });
  return { leadId: lead.id };
}
