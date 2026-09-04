import { NextResponse } from "next/server";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

const createSchema = z.object({
  estimateId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  amountCents: z.number().int().min(1000).max(5_000_000).optional(),
});

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const invoices = await prisma.invoice.findMany({
    where: { businessId: business.id },
    take: 80,
    orderBy: { createdAt: "desc" },
    include: {
      estimate: { select: { id: true, status: true, jobId: true } },
      payments: true,
    },
  });

  return NextResponse.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      payments: invoice.payments.map((payment) => ({
        ...payment,
        createdAt: payment.createdAt.toISOString(),
      })),
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

    let amountCents = body.amountCents ?? null;
    let jobId: string | null = body.jobId ?? null;
    let estimateId: string | null = body.estimateId ?? null;

    if (body.estimateId) {
      const estimate = await prisma.estimate.findFirst({
        where: { id: body.estimateId, businessId: business.id },
        include: { invoice: true },
      });
      if (!estimate) return forbiddenResponse();
      if (estimate.invoice) {
        return NextResponse.json(
          { error: "Estimate already has an invoice", invoice: estimate.invoice },
          { status: 409 },
        );
      }
      amountCents = estimate.amountCents;
      jobId = estimate.jobId;
      estimateId = estimate.id;

      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { status: "accepted" },
      });
    } else if (body.jobId && body.amountCents != null) {
      const job = await prisma.job.findFirst({
        where: { id: body.jobId, businessId: business.id },
      });
      if (!job) return forbiddenResponse();
      amountCents = body.amountCents;
      jobId = job.id;
    } else {
      return NextResponse.json(
        { error: "Provide estimateId, or jobId + amountCents" },
        { status: 400 },
      );
    }

    if (amountCents == null || amountCents <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    const invoice = await prisma.invoice.create({
      data: {
        businessId: business.id,
        jobId,
        estimateId,
        amountCents,
        status: "draft",
      },
      include: {
        estimate: { select: { id: true, status: true, jobId: true } },
      },
    });

    return NextResponse.json({
      invoice: {
        ...invoice,
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
      },
    });
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
