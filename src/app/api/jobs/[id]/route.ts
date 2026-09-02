import { NextResponse } from "next/server";
import { JOB_INCLUDE, isJobStatus, serializeJob, updateJobStatus } from "@/lib/job";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireBusinessSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

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

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

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

  const previousTechnicianId = existing.technicianId;
  const assigningTech =
    body.technicianId !== undefined &&
    body.technicianId !== previousTechnicianId;

  if (
    body.technicianId !== undefined &&
    body.technicianId
  ) {
    const tech = await prisma.technician.findFirst({
      where: { id: body.technicianId, businessId: business.id },
      select: { id: true },
    });
    if (!tech) {
      return NextResponse.json({ error: "Technician not found" }, { status: 400 });
    }
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

  let techSms: { sent: boolean; reason?: string } | undefined;
  if (assigningTech) {
    techSms = await notifyTechOnAssign({
      jobId: id,
      previousTechnicianId,
      nextTechnicianId: body.technicianId ?? null,
    });
  }

  return NextResponse.json({
    job: serializeJob(job),
    ...(techSms ? { techSms } : {}),
  });
}
