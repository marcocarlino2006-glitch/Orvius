import { NextResponse } from "next/server";
import { isJobStatus, serializeJob, updateJobStatus } from "@/lib/job";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          interactionCount: true,
        },
      },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          serviceType: true,
          urgency: true,
          notes: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job: serializeJob(job) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    scheduledAt?: string | null;
    notes?: string | null;
  };

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (body.status) {
    if (!isJobStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const job = await updateJobStatus(id, body.status);
    return NextResponse.json({ job: serializeJob(job) });
  }

  const job = await prisma.job.update({
    where: { id },
    data: {
      ...(body.scheduledAt !== undefined
        ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });

  return NextResponse.json({ job: serializeJob(job) });
}
