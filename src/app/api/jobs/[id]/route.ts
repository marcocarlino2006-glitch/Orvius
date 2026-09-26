import { NextResponse } from "next/server";
import { depositPayUrl, getDepositReadiness } from "@/lib/booking-deposit";
import { invoicePayUrl } from "@/lib/invoice-pay";
import { getConnectStatus } from "@/lib/stripe-connect";
import { recordAudit } from "@/lib/audit";
import { JOB_INCLUDE, isJobStatus, jobStatusLabel, serializeJob, updateJobStatus } from "@/lib/job";
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

  const invoice = await prisma.invoice.findFirst({
    where: { businessId: business.id, jobId: job.id },
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
    invoice: invoice
      ? {
          id: invoice.id,
          amountCents: invoice.amountCents,
          status: invoice.status,
          payUrl: invoice.publicToken ? invoicePayUrl(invoice.publicToken) : null,
          sentAt: invoice.sentAt?.toISOString() ?? null,
          paidAt: invoice.paidAt?.toISOString() ?? null,
        }
      : null,
    finalAmountCents: job.finalAmountCents,
    cardPayReady: getConnectStatus(business).canAcceptPayments,
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

  const auditBase = {
    businessId: business.id,
    entityType: "job" as const,
    entityId: id,
    actor: "owner" as const,
    jobId: id,
    leadId: existing.leadId,
    customerId: existing.customerId,
  };
  if (body.status && body.status !== existing.status) {
    await recordAudit({
      ...auditBase,
      action: "job.status_changed",
      summary: `Owner moved the job from ${jobStatusLabel(existing.status)} to ${jobStatusLabel(body.status)}.`,
      detail: { from: existing.status, to: body.status },
    });
  }
  if (assigningTech) {
    await recordAudit({
      ...auditBase,
      action: job.technician ? "technician.assigned" : "technician.unassigned",
      summary: job.technician
        ? `Owner assigned ${job.technician.name}.`
        : "Owner removed the technician.",
      detail: { from: previousTechnicianId, to: job.technicianId },
    });
  }
  if (
    body.scheduledAt !== undefined &&
    (job.scheduledAt?.getTime() ?? null) !== (existing.scheduledAt?.getTime() ?? null)
  ) {
    await recordAudit({
      ...auditBase,
      action: "job.rescheduled",
      summary: job.scheduledAt
        ? `Owner moved the appointment to ${job.scheduledAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: business.timezone ?? undefined })}.`
        : "Owner cleared the appointment time.",
      detail: { from: existing.scheduledAt?.toISOString() ?? null, to: job.scheduledAt?.toISOString() ?? null },
    });
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
