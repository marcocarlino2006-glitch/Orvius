import { prisma } from "@/lib/prisma";
import { formatWeeklyProof, getShopOutcomes, type ShopOutcomes } from "@/lib/shop-outcomes";

export type ProofKitReplay = {
  id: string;
  href: string;
  views: number;
  trade: string;
};

export type ProofKit = {
  shop: { id: string; name: string; trade: string | null; slug: string };
  outcomes: ShopOutcomes;
  proofText: string;
  replays: ProofKitReplay[];
};

type ProofDeps = {
  client?: typeof prisma;
  outcomes?: (businessId: string) => Promise<ShopOutcomes>;
  proof?: (outcomes: ShopOutcomes, shopName: string) => string;
};

/**
 * One shop's proof, in one place: the last week's outcome numbers, the
 * printable weekly proof, and the shop's listed gallery replays with their
 * public links. Only listed replays are included — pending, removed and
 * withdrawn calls never leave the building from here.
 */
export async function getProofKit(businessId: string, deps: ProofDeps = {}): Promise<ProofKit | null> {
  const client = deps.client ?? prisma;
  const business = await client.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, trade: true, slug: true },
  });
  if (!business) return null;
  const outcomesOf = deps.outcomes ?? ((id: string) => getShopOutcomes(id));
  const proofOf = deps.proof ?? formatWeeklyProof;
  const [outcomes, rows] = await Promise.all([
    outcomesOf(business.id),
    client.galleryCall.findMany({
      where: { businessId: business.id, status: "listed" },
      orderBy: { reviewedAt: "desc" },
      take: 12,
      select: { id: true, views: true, trade: true },
    }),
  ]);
  return {
    shop: business,
    outcomes,
    proofText: proofOf(outcomes, business.name),
    replays: rows.map((row) => ({ id: row.id, href: `/calls/${row.id}`, views: row.views, trade: row.trade })),
  };
}
