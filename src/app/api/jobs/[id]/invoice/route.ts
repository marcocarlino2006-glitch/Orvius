import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { sendInvoiceLink, upsertJobInvoice } from "@/lib/invoice-pay";
import { formatCentsExact } from "@/lib/money";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  totalCents: z.number().int().min(100).max(5_000_000),
  send: z.boolean().optional(),
});

/** Bill a job: the final total less any paid deposit, as one reusable pay link. */
export async function POST(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, businessId: business.id },
    select: { id: true, lead: { select: { phone: true } }, customer: { select: { phone: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  try {
    const body = bodySchema.parse(await request.json());
    const { invoice, created, depositPaidCents } = await upsertJobInvoice({
      businessId: business.id,
      jobId: job.id,
      totalCents: body.totalCents,
    });
    if (invoice.status === "paid") {
      return NextResponse.json({ error: "This job is already paid" }, { status: 409 });
    }

    await prisma.job.update({ where: { id: job.id }, data: { finalAmountCents: body.totalCents } });

    const phone = job.lead?.phone ?? job.customer?.phone ?? null;
    const sms = body.send && phone ? await sendInvoiceLink({ business, invoice, toPhone: phone }) : null;

    await recordAudit({
      businessId: business.id,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      actor: "owner",
      action: created ? "invoice.created" : "invoice.updated",
      summary: `Invoice ${formatCentsExact(invoice.amountCents)}${sms?.sent ? ", texted to the customer" : ""}`,
      detail: { totalCents: body.totalCents, depositPaidCents },
    });

    return NextResponse.json({ ok: true, created, depositPaidCents, invoiceId: invoice.id, sms });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Could not create invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
