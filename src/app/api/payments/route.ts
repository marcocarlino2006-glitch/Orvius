import { NextResponse } from "next/server";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

/** Record a manual payment against an invoice (no Stripe Connect yet). */
const createSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().min(100).max(5_000_000).optional(),
  method: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  try {
    const body = createSchema.parse(await request.json());
    const invoice = await prisma.invoice.findFirst({
      where: { id: body.invoiceId, businessId: business.id },
      include: { payments: true },
    });
    if (!invoice) return forbiddenResponse();

    const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
    const amountCents = body.amountCents ?? Math.max(invoice.amountCents - paidSoFar, 0);
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Invoice already fully paid" }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          businessId: business.id,
          invoiceId: invoice.id,
          amountCents,
          status: "recorded",
          method: body.method?.trim() || "manual",
        },
      });
      const totalPaid = paidSoFar + amountCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: totalPaid >= invoice.amountCents ? "paid" : "partial",
        },
      });
      return created;
    });

    return NextResponse.json({
      payment: {
        ...payment,
        createdAt: payment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Could not record payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
