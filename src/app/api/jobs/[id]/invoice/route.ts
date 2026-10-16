import { NextResponse } from "next/server";
import { z } from "zod";

import { personActor, recordAudit } from "@/lib/audit";
import { sendInvoiceLink, upsertJobInvoice } from "@/lib/invoice-pay";
import { formatCentsExact } from "@/lib/money";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireMoney } from "@/lib/money-authority";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  totalCents: z.number().int().min(100).max(5_000_000),
  send: z.boolean().optional(),
  /** Required to change a bill the customer was already sent, signed or paid toward. */
  reason: z.string().trim().max(300).optional(),
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
    if (body.reason) {
      const money = await requireMoney({ businessId: business.id, role: authResult.role, email: authResult.email }, "revise_bill", { amountCents: body.totalCents, entityType: "job", entityId: job.id, jobId: job.id });
      if ("error" in money) return money.error;
    }
    const actor = personActor(authResult);
    const { invoice, created, depositPaidCents, repriceHeld } = await upsertJobInvoice({
      businessId: business.id,
      jobId: job.id,
      totalCents: body.totalCents,
      ...(body.reason ? { revision: { reason: body.reason, actor: actor.actor === "owner" ? "owner" : "teammate", actorEmail: actor.actorEmail } } : {}),
    });
    if (invoice.status === "paid") {
      return NextResponse.json({ error: "This job is already paid" }, { status: 409 });
    }
    if (repriceHeld) {
      return NextResponse.json(
        {
          error: `The customer already has this bill at ${formatCentsExact(repriceHeld.fromCents)}. To change it to ${formatCentsExact(repriceHeld.toCents)}, add why.`,
          code: "bill_committed",
          ...repriceHeld,
        },
        { status: 409 },
      );
    }

    await prisma.job.update({ where: { id: job.id }, data: { finalAmountCents: body.totalCents } });

    const phone = job.lead?.phone ?? job.customer?.phone ?? null;
    const sms = body.send && phone ? await sendInvoiceLink({ business, invoice, toPhone: phone, authorizedBy: "owner:invoice_send" }) : null;

    await recordAudit({
      businessId: business.id,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      ...actor,
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
