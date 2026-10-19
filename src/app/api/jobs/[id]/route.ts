import { NextResponse } from "next/server";
import { depositPayUrl, getDepositReadiness } from "@/lib/booking-deposit";
import { invoiceCompletedJob, invoicePayUrl } from "@/lib/invoice-pay";
import { claimedCents, collectedCents, collectedHow } from "@/lib/payment-record";
import { moneyTotals } from "@/lib/payment-math";
import { getConnectStatus } from "@/lib/stripe-connect";
import { personActor, recordAudit } from "@/lib/audit";
import { DEFAULT_JOB_DURATION_MIN, shopWallInputToUtc } from "@/lib/availability";
import { textDelivery } from "@/lib/job-lifecycle";
import { transitionJob, type CompletionEvidence } from "@/lib/job-transition";
import { authorizeScheduleOverride, scheduleOverrideRecord, type OverrideAuthority } from "@/lib/scheduling-policy";
import { JOB_INCLUDE, JobTransitionError, isJobStatus, ownerScheduleClash, serializeJob } from "@/lib/job";
import { classifyRequest } from "@/lib/trade-playbooks";
import { logWarn } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { notifyTechJobChanged } from "@/lib/tech-app";
import { buildOutcome, type Outcome, type OutcomeStage } from "@/lib/outcome";
import { recordWorkflowDecision, recordWorkflowProgress } from "@/lib/workflow-events";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { interactionFloor } from "@/lib/customer";

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
    include: { payments: { select: { amountCents: true, status: true, method: true, refundedCents: true } } },
  });

  const confirmText = job.customerConfirmSid
    ? await prisma.message.findFirst({
        where: { businessId: business.id, sid: job.customerConfirmSid, direction: "out" },
        select: { deliveryStatus: true },
      })
    : null;
  const customerConfirmDelivery = job.customerConfirmSentAt
    ? textDelivery({ sid: job.customerConfirmSid, deliveryStatus: confirmText?.deliveryStatus, sentAt: job.customerConfirmSentAt })
    : null;

  const serialized = serializeJob(job);
  if (serialized.customer) {
    const counts = await prisma.customer.findUnique({
      where: { id: serialized.customer.id },
      select: { _count: { select: { calls: true, leads: true, jobs: true } } },
    });
    if (counts) {
      serialized.customer = {
        ...serialized.customer,
        interactionCount: interactionFloor(serialized.customer.interactionCount, counts._count),
      };
    }
  }

  return NextResponse.json({
    job: { ...serialized, customerConfirmDelivery },
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
          collectedCents: collectedCents(invoice.payments),
          claimedCents: claimedCents(invoice.payments),
          collectedHow: collectedHow(invoice.payments),
          refundedCents: moneyTotals(invoice.payments).refundedCents,
          keptCents: moneyTotals(invoice.payments).netCents,
        }
      : null,
    finalAmountCents: job.finalAmountCents,
    cardPayReady: getConnectStatus(business).canAcceptPayments,
    salesTaxBps: business.salesTaxBps ?? 0,
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
    /** The time as the owner typed it, read on the shop's clock rather than the browser's. */
    scheduledLocal?: string | null;
    notes?: string | null;
    technicianId?: string | null;
    /** Why the owner cancelled, moved or reassigned it; kept in the job's history. */
    reason?: string | null;
    /** The person saw the clash and chose this time or tech anyway. */
    allowClash?: boolean;
    /** What happened, when marking it done. */
    completion?: CompletionEvidence;
  };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;
  const because = reason ? ` Reason: ${reason}` : "";
  if (body.scheduledLocal) {
    const at = shopWallInputToUtc(body.scheduledLocal, business.timezone);
    if (!at) return NextResponse.json({ error: "Pick a time." }, { status: 422 });
    body.scheduledAt = at.toISOString();
  }

  const existing = await prisma.job.findFirst({
    where: { id, businessId: business.id },
  });
  if (!existing) {
    return forbiddenResponse();
  }

  if (body.status && !isJobStatus(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
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
      select: { id: true, isActive: true, name: true },
    });
    if (!tech) {
      return NextResponse.json({ error: "Technician not found" }, { status: 400 });
    }
    if (!tech.isActive) {
      return NextResponse.json({ error: `${tech.name} is off the team. Bring them back on the Team page first.` }, { status: 400 });
    }
  }

  const nextAt = body.scheduledAt !== undefined ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : existing.scheduledAt;
  const nextTech = body.technicianId !== undefined ? body.technicianId || null : existing.technicianId;
  const moved = body.scheduledAt !== undefined && (nextAt?.getTime() ?? null) !== (existing.scheduledAt?.getTime() ?? null);
  const reassigned = body.technicianId !== undefined && nextTech !== existing.technicianId && Boolean(nextTech);
  const finalStatus = body.status ?? existing.status;
  let clash: string | null = null;
  let override: Extract<OverrideAuthority, { ok: true }> | null = null;
  if (nextAt && (moved || reassigned) && finalStatus !== "completed" && finalStatus !== "cancelled") {
    clash = await ownerScheduleClash({
      businessId: business.id,
      at: nextAt,
      durationMin: existing.durationMin ?? DEFAULT_JOB_DURATION_MIN,
      skill: classifyRequest({ business, serviceType: existing.serviceType, notes: existing.notes, urgency: null }).service.skill,
      timezone: business.timezone ?? "America/New_York",
      technicianId: nextTech,
      excludeJobId: existing.id,
    });
    if (clash && body.allowClash !== true) {
      return NextResponse.json({ error: clash, clash: true }, { status: 409 });
    }
    if (clash) {
      const authority = await authorizeScheduleOverride({
        businessId: business.id,
        actor: { role: authResult.role, email: authResult.email },
        reason,
      });
      if (!authority.ok) return NextResponse.json({ error: authority.error, clash: true, needsReason: authority.status === 422 }, { status: authority.status });
      override = authority;
    }
  }

  if (body.status && isJobStatus(body.status)) {
    try {
      await transitionJob({
        businessId: business.id,
        jobId: id,
        to: body.status,
        actor: { kind: authResult.role, email: authResult.email },
        via: "dashboard",
        completion: body.completion ?? null,
        reason,
        allowClash: body.allowClash === true,
      });
    } catch (error) {
      if (error instanceof JobTransitionError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
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
                  ...(changed ? { customerConfirmedAt: null, techAcceptedAt: null } : {}),
                  ...(changed && !body.status && existing.status === "confirmed" ? { status: "scheduled" } : {}),
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
    ...personActor(authResult),
    jobId: id,
    leadId: existing.leadId,
    customerId: existing.customerId,
  };
  if (clash && override) {
    await recordAudit({
      ...auditBase,
      action: "job.schedule_override",
      summary: `Booked over a clash: ${clash}${because}`,
      detail: await scheduleOverrideRecord({
        businessId: business.id,
        clash,
        before: { at: existing.scheduledAt, technicianId: existing.technicianId },
        after: { at: nextAt, technicianId: nextTech },
        durationMin: existing.durationMin ?? DEFAULT_JOB_DURATION_MIN,
        excludeJobId: existing.id,
        actor: { role: authResult.role, email: authResult.email },
        authority: override,
        via: "dashboard",
        notify: {
          customer: moved ? "reconfirm_new_time" : "none",
          technician: reassigned ? "assignment_text" : moved && nextTech ? "moved_text" : "none",
        },
      }),
    });
  }
  if (assigningTech) {
    await recordAudit({
      ...auditBase,
      action: job.technician ? "technician.assigned" : "technician.unassigned",
      summary: job.technician
        ? `Owner assigned ${job.technician.name}.${because}`
        : `Owner removed the technician.${because}`,
      detail: { from: previousTechnicianId, to: job.technicianId, reason },
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
        ? `Owner moved the appointment to ${job.scheduledAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: business.timezone ?? undefined })}.${because}`
        : `Owner cleared the appointment time.${because}`,
      detail: { from: existing.scheduledAt?.toISOString() ?? null, to: job.scheduledAt?.toISOString() ?? null, reason },
    });
  }

  let invoiceSent: boolean | undefined;
  let invoice: OutcomeStage | null = null;
  let outcome: Outcome | null = null;
  if (body.status === "completed" && existing.status !== "completed") {
    /* The job stays done either way; a bill that didn't get made or sent is read back from the records below. */
    const billed = await invoiceCompletedJob(id).catch((error) => {
      logWarn("invoice.on_complete_failed", {
        jobId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    invoiceSent = Boolean(billed && "sms" in billed && billed.sms?.sent);
    outcome = await buildOutcome(business.id, { jobId: id }).catch(() => null);
    invoice = outcome?.stages.find((s) => s.stage === "invoice") ?? null;
    if (outcome) {
      /* The job is already done; reporting can't turn that into an error. */
      try {
        const who = { actor: personActor(authResult).actor as "owner" | "teammate", email: authResult.email };
        await recordWorkflowDecision(outcome, "recorded_completion", who, id);
        await recordWorkflowProgress(outcome, who);
      } catch (error) {
        logWarn("workflow.report_failed", { jobId: id, error: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  let techSms: { sent: boolean; reason?: string } | undefined;
  if (assigningTech) {
    techSms = await notifyTechOnAssign({
      jobId: id,
      previousTechnicianId,
      nextTechnicianId: body.technicianId ?? null,
    });
  }

  /* The technician who had it hears about it: moved, cancelled, or handed to someone else. */
  let techChange: Awaited<ReturnType<typeof notifyTechJobChanged>> | undefined;
  if (previousTechnicianId && assigningTech) {
    techChange = await notifyTechJobChanged({ jobId: id, technicianId: previousTechnicianId, change: "removed" });
  } else if (existing.technicianId && body.status === "cancelled" && existing.status !== "cancelled") {
    techChange = await notifyTechJobChanged({ jobId: id, technicianId: existing.technicianId, change: "cancelled" });
  } else if (
    job.technicianId &&
    body.scheduledAt !== undefined &&
    (job.scheduledAt?.getTime() ?? null) !== (existing.scheduledAt?.getTime() ?? null) &&
    job.status !== "completed" &&
    job.status !== "cancelled"
  ) {
    techChange = await notifyTechJobChanged({ jobId: id, technicianId: job.technicianId, change: "moved" });
  }

  const answered = assigningTech ? await prisma.job.findUnique({ where: { id }, include: JOB_INCLUDE }) : null;
  return NextResponse.json({
    job: serializeJob(answered ?? job),
    ...(techSms ? { techSms } : {}),
    ...(techChange ? { techChange } : {}),
    ...(invoiceSent !== undefined ? { invoiceSent } : {}),
    ...(invoice ? { invoice } : {}),
    ...(outcome ? { outcome } : {}),
  });
}
