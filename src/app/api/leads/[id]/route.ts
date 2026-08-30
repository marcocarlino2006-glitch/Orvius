import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          interactionCount: true,
        },
      },
      call: {
        select: {
          id: true,
          summary: true,
          transcript: true,
          durationSec: true,
          status: true,
          createdAt: true,
        },
      },
      job: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          title: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead: {
      ...lead,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      call: lead.call
        ? {
            ...lead.call,
            createdAt: lead.call.createdAt.toISOString(),
          }
        : null,
      job: lead.job
        ? {
            ...lead.job,
            scheduledAt: lead.job.scheduledAt?.toISOString() ?? null,
          }
        : null,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (!body.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: { status: body.status },
  });

  return NextResponse.json({ lead });
}
