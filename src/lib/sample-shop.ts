import { prisma } from "@/lib/prisma";

/**
 * The public reference shop, and only that shop.
 * A customer who names their business Summit is a different slug, so they are never served here.
 * Prefer the marketing reference (summit-hvac-demo) when both rows exist.
 */
const PUBLIC_SAMPLE_SLUGS = ["summit-hvac-demo", "summit-hvac"] as const;

export async function findPublicSampleShop() {
  const rows = await prisma.business.findMany({
    where: { isActive: true, slug: { in: [...PUBLIC_SAMPLE_SLUGS] } },
  });
  for (const slug of PUBLIC_SAMPLE_SLUGS) {
    const shop = rows.find((row) => row.slug === slug);
    if (shop) return shop;
  }
  return null;
}
