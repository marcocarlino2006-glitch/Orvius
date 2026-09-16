import { NextResponse } from "next/server";
import { depositPayUrl, getDepositReadiness } from "@/lib/booking-deposit";
import { JOB_INCLUDE, isJobStatus, serializeJob, updateJobStatus } from "@/lib/job";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
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

  /*
    Matched on the lead as well as the job, because a deposit asked for during
    booking is stamped with whichever of the two existed at the time. Keyed on
    the job alone, an already-paid deposit would look unrequested and the panel
    would offer to ask the customer for a second one.
  */
  const deposit = await prisma.deposit.findFirst({
    where: {
      businessId: business.id,
      OR: [
        { jobId: job.id },
        ...(job.leadId ? [{ leadId: job.leadId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    job: serializeJob(job),
    deposit: deposit
      ? {
          id: deposit.id,
          amountCents: deposit.amountCents,
          status: deposit.status,
          /* The same link the customer is texted, not a rebuilt one. */
          payUrl: deposit.publicToken
            ? depositPayUrl(deposit.publicToken)
            : null,
          sentAt: deposit.sentAt?.toISOString() ?? null,
          paidAt: deposit.paidAt?.toISOString() ?? null,
        }
      : null,
    depositReadiness: getDepositReadiness(business),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
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
            ? (() => {
                const next = body.scheduledAt ? new Date(body.scheduledAt) : null;
                const prev = existing.scheduledAt;
                const changed =
                  (next?.getTime() ?? null) !== (prev?.getTime() ?? null);
                return {
                  scheduledAt: next,
                  ...(changed ? { customerConfirmedAt: null } : {}),
                };
              })()
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
