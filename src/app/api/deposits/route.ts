import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_DEPOSIT_CENTS,
  createDepositForLead,
  depositPayUrl,
  getDepositReadiness,
  resolveDepositAmountCents,
  sendDepositLink,
} from "@/lib/booking-deposit";
import { STRIPE_MIN_CHARGE_CENTS } from "@/lib/platform-fee";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

export const runtime = "nodejs";

const createSchema = z.object({
  leadId: z.string().min(1),
  amountCents: z
    .number()
    .int()
    .min(STRIPE_MIN_CHARGE_CENTS)
    .max(MAX_DEPOSIT_CENTS)
    .optional(),
  /** Text the link to the caller as well as returning it. */
  send: z.boolean().optional(),
});

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const deposits = await prisma.deposit.findMany({
    where: { businessId: business.id },
    take: 80,
    orderBy: { createdAt: "desc" },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, serviceType: true },
      },
    },
  });

  return NextResponse.json({
    readiness: getDepositReadiness(business),
    defaultAmountCents: resolveDepositAmountCents(business),
    deposits: deposits.map((d) => ({
      id: d.id,
      amountCents: d.amountCents,
      status: d.status,
      applicationFeeCents: d.applicationFeeCents,
      payUrl: d.publicToken ? depositPayUrl(d.publicToken) : null,
      lead: d.lead,
      sentAt: d.sentAt?.toISOString() ?? null,
      paidAt: d.paidAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  try {
    const body = createSchema.parse(await request.json());

    const lead = await prisma.lead.findFirst({
      where: { id: body.leadId, businessId: business.id },
      include: { job: { select: { id: true } } },
    });
    if (!lead) return forbiddenResponse();

    /*
      An explicit amount still requires a connected account, because the
      charge itself is impossible without one. Only the shop's default amount
      falls back to the deposit settings.
    */
    /*
      An already-requested deposit keeps its own amount. Re-deriving it from
      current settings means a shop that has since changed or switched off its
      default cannot resend a link the customer has already been quoted — and
      worse, could resend a different number than the one they saw.
    */
    const active = await prisma.deposit.findFirst({
      where: {
        businessId: business.id,
        leadId: lead.id,
        status: { in: ["pending", "paid"] },
      },
      orderBy: { createdAt: "desc" },
      select: { amountCents: true },
    });

    const readiness = getDepositReadiness(business);
    const amountCents =
      body.amountCents ??
      active?.amountCents ??
      resolveDepositAmountCents(business);

    if (!readiness.ready && readiness.reason === "connect_incomplete") {
      return NextResponse.json(
        {
          error:
            "Connect a payout account before asking customers for a deposit.",
          reason: "connect_incomplete",
        },
        { status: 409 },
      );
    }
    if (amountCents == null) {
      return NextResponse.json(
        {
          error: "Set a deposit amount in Billing, or pass amountCents.",
          reason: "deposits_off",
        },
        { status: 400 },
      );
    }

    const { deposit, created } = await createDepositForLead({
      businessId: business.id,
      leadId: lead.id,
      jobId: lead.job?.id ?? null,
      amountCents,
    });

    let sms: Awaited<ReturnType<typeof sendDepositLink>> | null = null;
    if (body.send && lead.phone) {
      sms = await sendDepositLink({
        business,
        deposit,
        toPhone: lead.phone,
      });
    }

    return NextResponse.json({
      created,
      deposit: {
        id: deposit.id,
        amountCents: deposit.amountCents,
        status: deposit.status,
        payUrl: deposit.publicToken ? depositPayUrl(deposit.publicToken) : null,
        createdAt: deposit.createdAt.toISOString(),
      },
      sms,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Could not create deposit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
