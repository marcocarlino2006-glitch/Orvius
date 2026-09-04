import { NextResponse } from "next/server";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

const createSchema = z.object({
  jobId: z.string().min(1),
  amountCents: z.number().int().min(1000).max(5_000_000).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const estimates = await prisma.estimate.findMany({
    where: { businessId: business.id },
    take: 80,
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json({
    estimates: estimates.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
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

    const job = await prisma.job.findFirst({
      where: { id: body.jobId, businessId: business.id },
      include: { estimate: true, lead: { select: { id: true } } },
    });
    if (!job) return forbiddenResponse();
    if (job.estimate) {
      return NextResponse.json(
        { error: "Job already has an estimate", estimate: job.estimate },
        { status: 409 },
      );
    }

    const amountCents =
      body.amountCents ??
      business.avgTicketCents ??
      null;
    if (amountCents == null) {
      return NextResponse.json(
        {
          error:
            "Set an average ticket in Settings or pass amountCents to create an estimate.",
        },
        { status: 400 },
      );
    }

    const estimate = await prisma.estimate.create({
      data: {
        businessId: business.id,
        jobId: job.id,
        leadId: job.leadId ?? job.lead?.id ?? null,
        amountCents,
        status: "draft",
        notes: body.notes?.trim() || null,
      },
      include: { job: { select: { id: true, title: true, status: true } } },
    });

    return NextResponse.json({
      estimate: {
        ...estimate,
        createdAt: estimate.createdAt.toISOString(),
        updatedAt: estimate.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Could not create estimate";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
