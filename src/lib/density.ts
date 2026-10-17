import { prisma } from "@/lib/prisma";

export type DensityRow = { trade: string; metro: string; shops: number };

export type Density = {
  total: number;
  metros: number;
  densest: DensityRow | null;
  rows: DensityRow[];
};

const STATE_ZIP = /^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/;
const STATE_ONLY = /^[A-Za-z]{2}$/;

/**
 * The metro is the city in the address tail ("…, Austin, TX 78704"). There is
 * no city column, so addresses that do not carry a readable city land in
 * "Metro not set" rather than being guessed at.
 */
export function metroFromAddress(address: string | null | undefined): string {
  if (!address) return "Metro not set";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return "Metro not set";
  const last = parts[parts.length - 1];
  if (STATE_ZIP.test(last) || STATE_ONLY.test(last)) {
    return parts[parts.length - 2] || "Metro not set";
  }
  return "Metro not set";
}

/**
 * Where production shops actually cluster, trade by metro. Demo and test
 * shops are excluded: density only counts when the shops are real.
 */
export async function getDensity(client = prisma): Promise<Density> {
  const shops = await client.business.findMany({
    where: { environment: "production" },
    select: { trade: true, address: true },
  });
  const byCell = new Map<string, DensityRow>();
  for (const shop of shops) {
    const trade = shop.trade?.trim() || "Trade not set";
    const metro = metroFromAddress(shop.address);
    const key = `${trade}\u0000${metro}`;
    const row = byCell.get(key) ?? { trade, metro, shops: 0 };
    row.shops += 1;
    byCell.set(key, row);
  }
  const rows = [...byCell.values()].sort(
    (a, b) => b.shops - a.shops || a.trade.localeCompare(b.trade) || a.metro.localeCompare(b.metro),
  );
  return {
    total: shops.length,
    metros: new Set(rows.map((row) => row.metro).filter((metro) => metro !== "Metro not set")).size,
    densest: rows.find((row) => row.metro !== "Metro not set") ?? null,
    rows,
  };
}
