/*
  Where the network can work. A handoff needs two shops of the same trade in
  the same three-digit ZIP area, so the board counts exactly that: shops per
  area and trade, and how many of them have the network on. Pure, so the admin
  page and the weekly email read the same numbers.
*/

export type DensityShop = { trade: string | null; zip3: string | null; networkOn: boolean };

export type DensityCluster = { zip3: string; trade: string; shops: number; networkOn: number };

export function zip3FromAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const zips = [...text.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  return zips.length ? zips[zips.length - 1][1].slice(0, 3) : null;
}

export function densityClusters(shops: DensityShop[], limit = 8): DensityCluster[] {
  const byKey = new Map<string, DensityCluster>();
  for (const shop of shops) {
    if (!shop.zip3) continue;
    const trade = shop.trade?.trim().toLowerCase() || "other";
    const key = `${shop.zip3}|${trade}`;
    const cluster = byKey.get(key) ?? { zip3: shop.zip3, trade, shops: 0, networkOn: 0 };
    cluster.shops += 1;
    if (shop.networkOn) cluster.networkOn += 1;
    byKey.set(key, cluster);
  }
  return [...byKey.values()]
    .sort((a, b) => b.shops - a.shops || b.networkOn - a.networkOn || a.zip3.localeCompare(b.zip3))
    .slice(0, limit);
}

/** Areas where a pass can land today: two or more same-trade shops with the network on. */
export function networkReadyAreas(clusters: DensityCluster[]) {
  return clusters.filter((c) => c.networkOn >= 2).length;
}

export function densityText(clusters: DensityCluster[]) {
  if (!clusters.length) return "none yet";
  return clusters.map((c) => `${c.zip3}xx ${c.trade} ${c.shops} (${c.networkOn} on network)`).join(" · ");
}
