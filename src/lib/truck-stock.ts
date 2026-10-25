import { relationMissing } from "@/lib/find-schema";
import { prisma } from "@/lib/prisma";

export class TruckCountLater extends Error {
  constructor() {
    super("Truck counts aren't on this shop yet. The price was saved. Try the count again in a few minutes.");
  }
}

const NOT_COUNTED = "This shop hasn't counted that part. Say the technician will confirm whether it's on the truck. Do not name a number.";

type StockLine = { kind: string; quantity: number; priceBookItemId: string | null };

function partQuantities(lines: StockLine[]) {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (line.kind !== "part" || !line.priceBookItemId) continue;
    const qty = Math.round(line.quantity);
    if (!Number.isFinite(qty)) continue;
    map.set(line.priceBookItemId, (map.get(line.priceBookItemId) ?? 0) + qty);
  }
  return map;
}

/** Counts for parts the shop has counted. A missing table means nothing has been counted yet. */
export async function partStockFor(businessId: string, priceBookItemIds: string[]): Promise<Map<string, number> | null> {
  if (!priceBookItemIds.length) return new Map();
  try {
    const rows = await prisma.partStock.findMany({
      where: { businessId, priceBookItemId: { in: priceBookItemIds } },
      select: { priceBookItemId: true, onTruck: true },
    });
    return new Map(rows.map((row) => [row.priceBookItemId, row.onTruck]));
  } catch (error) {
    if (relationMissing(error, "PartStock")) return null;
    throw error;
  }
}

/**
 * Save a counted quantity, or clear it. Null means the shop has not counted the part.
 * The price itself is saved by the caller even when this table is not on the database yet.
 */
export async function writePartStock(businessId: string, priceBookItemId: string, kind: string, onTruck: number | null) {
  try {
    if (kind !== "part" || onTruck == null) {
      await prisma.partStock.deleteMany({ where: { priceBookItemId, businessId } });
      return;
    }
    await prisma.partStock.upsert({
      where: { priceBookItemId },
      create: { priceBookItemId, businessId, onTruck },
      update: { businessId, onTruck },
    });
  } catch (error) {
    if (relationMissing(error, "PartStock")) {
      if (onTruck == null) return;
      throw new TruckCountLater();
    }
    throw error;
  }
}

/**
 * A job's lines changed. Counted parts move on or off the truck by the difference.
 * Using more than the count leaves zero. A part the shop has not counted is left alone.
 */
export async function applyTruckUse(businessId: string, before: StockLine[], after: StockLine[]) {
  const previous = partQuantities(before);
  const next = partQuantities(after);
  const ids = new Set([...previous.keys(), ...next.keys()]);
  for (const id of ids) {
    const delta = (next.get(id) ?? 0) - (previous.get(id) ?? 0);
    if (!delta) continue;
    try {
      if (delta > 0) {
        const dropped = await prisma.partStock.updateMany({
          where: { priceBookItemId: id, businessId, onTruck: { gte: delta } },
          data: { onTruck: { decrement: delta } },
        });
        if (!dropped.count) {
          await prisma.partStock.updateMany({ where: { priceBookItemId: id, businessId }, data: { onTruck: 0 } });
        }
      } else {
        await prisma.partStock.updateMany({
          where: { priceBookItemId: id, businessId },
          data: { onTruck: { increment: -delta } },
        });
      }
    } catch (error) {
      if (relationMissing(error, "PartStock")) return;
      throw error;
    }
  }
}

/** What the receptionist may say. A number appears only when this shop counted that part. */
export async function checkTruck(businessId: string, part: string): Promise<string> {
  const name = part.trim().slice(0, 80);
  if (!name) return "Ask which part. Do not say one is on the truck.";
  const all = await prisma.priceBookItem.findMany({
    where: { businessId, isActive: true, kind: "part" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const needle = name.toLowerCase();
  const items = all.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, 5);
  if (!items.length) return `Nothing named "${name}" is on this shop's price book. Say the technician will confirm. Do not name a number.`;
  const stock = await partStockFor(businessId, items.map((item) => item.id));
  if (!stock) return NOT_COUNTED;
  return items
    .map((item) => {
      const count = stock.get(item.id);
      if (count == null) return `${item.name}: not counted. ${NOT_COUNTED}`;
      if (count <= 0) return `${item.name}: 0 on the truck. Say none are counted on the truck, and the technician will confirm.`;
      return `${item.name}: ${count} on the truck. You may say that count.`;
    })
    .join(" ");
}
