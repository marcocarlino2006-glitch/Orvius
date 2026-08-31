import { NextResponse } from "next/server";
import { JOB_INCLUDE, isJobStatus, serializeJob, updateJobStatus } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireBusinessSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;

  const job = await prisma.job.findFirst({
    where: { id, businessId: business.id },
    include: JOB_INCLUDE,
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job: serializeJob(job) });
}

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    scheduledAt?: string | null;
    notes?: string | null;
    technicianId?: string | null;
  };

  const existing = await prisma.job.findFirst({
    where: { id, businessId: business.id },
  });
  if (!existing) {
    return forbiddenResponse();
  }

  if (body.status) {
    if (!isJobStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await updateJobStatus(id, body.status);
  }

  const extras =
    body.scheduledAt !== undefined ||
    body.notes !== undefined ||
    body.technicianId !== undefined;

  const job = extras
    ? await prisma.job.update({
        where: { id },
        data: {
          ...(body.scheduledAt !== undefined
            ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.technicianId !== undefined
            ? { technicianId: body.technicianId || null }
            : {}),
        },
        include: JOB_INCLUDE,
      })
    : await prisma.job.findUnique({
        where: { id },
        include: JOB_INCLUDE,
      });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job: serializeJob(job) });
}
