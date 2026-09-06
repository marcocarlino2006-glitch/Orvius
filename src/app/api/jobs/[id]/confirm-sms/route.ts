import { NextResponse } from "next/server";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { JOB_INCLUDE, serializeJob } from "@/lib/job";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/**
 * Send / resend customer confirm SMS for a proposed job window.
 * Keeps “booked ≠ confirmed” actionable from Attention and job detail.
 */
export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const existing = await prisma.job.findFirst({
    where: { id, businessId: business.id },
    select: { id: true },
  });
  if (!existing) return forbiddenResponse();

  const result = await sendCustomerConfirmSms(id);
  if (!result.sent) {
    const status =
      result.reason === "already_confirmed"
        ? 409
        : result.reason === "not_found"
          ? 404
          : 400;
    return NextResponse.json(
      {
        error:
          result.reason === "already_confirmed"
            ? "Customer already confirmed"
            : result.reason === "no_customer_phone"
              ? "No customer phone on this job"
              : result.reason === "sms_not_configured"
                ? "SMS is not configured"
                : result.reason ?? "Could not send confirm SMS",
        reason: result.reason,
      },
      { status },
    );
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: JOB_INCLUDE,
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    job: job ? serializeJob(job) : null,
  });
}
