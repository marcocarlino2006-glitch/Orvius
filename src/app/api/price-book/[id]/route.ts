import { cleanPriceBookEntry, FieldError } from "@/lib/job-field";
import { requireMoney } from "@/lib/money-authority";
import { withOffice } from "@/lib/office-route";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async ({ business, role, email }) => {
    const entry = cleanPriceBookEntry((await request.json().catch(() => ({}))) as Record<string, unknown>);
    const money = await requireMoney({ businessId: business.id, role, email }, "price_book", { amountCents: entry.unitCents, entityType: "price_book", entityId: id });
    if ("error" in money) return money.error;
    const clash = await prisma.priceBookItem.findFirst({ where: { businessId: business.id, name: entry.name, id: { not: id } }, select: { id: true } });
    if (clash) throw new FieldError(`"${entry.name}" is already in your price book.`, 409);
    const updated = await prisma.priceBookItem.updateMany({ where: { id, businessId: business.id }, data: entry });
    if (!updated.count) throw new FieldError("Not found", 404);
    return { ok: true };
  });
}

/** Retired, not deleted: jobs that used it keep their lines. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async ({ business, role, email }) => {
    const money = await requireMoney({ businessId: business.id, role, email }, "price_book", { entityType: "price_book", entityId: id });
    if ("error" in money) return money.error;
    const updated = await prisma.priceBookItem.updateMany({ where: { id, businessId: business.id }, data: { isActive: false } });
    if (!updated.count) throw new FieldError("Not found", 404);
    return { ok: true };
  });
}
