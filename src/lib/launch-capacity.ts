import { prisma } from "@/lib/prisma";

/*
  How many new shops Orvius takes on this month. Set by the founder from what
  onboarding and the phone account can really carry, never a made-up number:
  with ORVIUS_MONTHLY_SHOP_CAPACITY unset the page shows no count at all.
*/

export type LaunchCapacity = { capacity: number | null; taken: number; left: number | null; month: string };

export function monthlyShopCapacity(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.ORVIUS_MONTHLY_SHOP_CAPACITY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function launchCapacity(now = new Date()): Promise<LaunchCapacity> {
  const capacity = monthlyShopCapacity();
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  if (capacity == null) return { capacity: null, taken: 0, left: null, month };
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const taken = await prisma.business.count({ where: { environment: "production", createdAt: { gte: start } } });
  return { capacity, taken, left: Math.max(0, capacity - taken), month };
}
