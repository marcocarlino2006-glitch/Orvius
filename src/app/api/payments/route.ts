import { NextResponse } from "next/server";
import { personActor } from "@/lib/audit";
import { confirmCustomerClaim, OWNER_METHODS, recordShopPayment, rejectCustomerClaim } from "@/lib/payment-record";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

/*
  Money the shop has in hand that didn't come through card checkout, and the
  owner's answer to a customer who says "I paid". Card payments are recorded by
  the processor webhook, never here.
*/
const schema = z.object({
  invoiceId: z.string().min(1),
  action: z.enum(["record", "confirm", "reject"]).default("record"),
  amountCents: z.number().int().min(100).max(5_000_000).optional(),
  method: z.enum(OWNER_METHODS).default("other"),
});

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick how the customer paid: cash, check, bank transfer or other." }, { status: 400 });
  }
  const body = parsed.data;

  const invoice = await prisma.invoice.findFirst({
    where: { id: body.invoiceId, businessId: business.id },
    select: { id: true, jobId: true, estimate: { select: { jobId: true } } },
  });
  if (!invoice) return forbiddenResponse();
  const jobId = invoice.jobId ?? invoice.estimate?.jobId ?? invoice.id;
  const who = personActor(authResult);
  const base = { businessId: business.id, invoiceId: invoice.id, jobId, actor: who.actor, actorEmail: who.actorEmail };

  if (body.action === "confirm") {
    const result = await confirmCustomerClaim(base);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, paid: result.paid });
  }
  if (body.action === "reject") {
    await rejectCustomerClaim(base);
    return NextResponse.json({ ok: true, paid: false });
  }
  const result = await recordShopPayment({ ...base, method: body.method, amountCents: body.amountCents });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, paid: result.paid, amountCents: result.amountCents });
}
