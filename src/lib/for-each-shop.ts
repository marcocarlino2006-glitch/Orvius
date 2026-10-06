import type { Business, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SHOP_PAGE = 100;
const SHOP_CONCURRENCY = 8;

/**
 * Every matching shop, paged by id, a few at a time, starting at a random
 * shop and wrapping round. Returns false when it stopped at the deadline
 * before reaching them all.
 */
export async function forEachShop(
  where: Prisma.BusinessWhereInput,
  stop: () => boolean,
  run: (shop: Business) => Promise<void>,
) {
  const total = await prisma.business.count({ where });
  if (!total) return true;
  const start = Math.floor(Math.random() * total);
  let done = 0;
  while (done < total) {
    if (stop()) return false;
    const page = await prisma.business.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (start + done) % total,
      take: Math.min(SHOP_PAGE, total - done, total - ((start + done) % total)),
    });
    if (!page.length) return true;
    for (let i = 0; i < page.length; i += SHOP_CONCURRENCY) {
      if (stop()) return false;
      await Promise.all(page.slice(i, i + SHOP_CONCURRENCY).map(run));
    }
    done += page.length;
  }
  return true;
}
