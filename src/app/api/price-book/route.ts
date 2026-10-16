import { cleanPriceBookEntry, FieldError, priceBook } from "@/lib/job-field";
import { requireMoney } from "@/lib/money-authority";
import { withOffice } from "@/lib/office-route";
import { prisma } from "@/lib/prisma";

/** The shop's saved services, labor and parts. */
export async function GET() {
  return withOffice("jobs", async ({ business }) => ({ items: await priceBook(business.id) }));
}

export async function POST(request: Request) {
  return withOffice("jobs", async ({ business, role, email }) => {
    const entry = cleanPriceBookEntry((await request.json().catch(() => ({}))) as Record<string, unknown>);
    const money = await requireMoney({ businessId: business.id, role, email }, "price_book", { amountCents: entry.unitCents, entityType: "price_book", entityId: entry.name });
    if ("error" in money) return money.error;
    const existing = await prisma.priceBookItem.findUnique({ where: { businessId_name: { businessId: business.id, name: entry.name } } });
    if (existing?.isActive) throw new FieldError(`"${entry.name}" is already in your price book.`, 409);
    const item = existing
      ? await prisma.priceBookItem.update({ where: { id: existing.id }, data: { ...entry, isActive: true } })
      : await prisma.priceBookItem.create({ data: { ...entry, businessId: business.id } });
    return { item: { id: item.id, name: item.name, kind: item.kind, unitCents: item.unitCents, description: item.description } };
  });
}
