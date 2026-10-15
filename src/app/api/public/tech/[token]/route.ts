import { invoiceCompletedJob } from "@/lib/invoice-pay";
import { logWarn } from "@/lib/logger";
import { NextResponse } from "next/server";
import { ensureJobTechToken, techLinkExpired } from "@/lib/ensure-tech-token";
import { JobTransitionError, isJobStatus } from "@/lib/job";
import { transitionJob } from "@/lib/job-transition";
import { isJobOutcomeCode } from "@/lib/job-outcome";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { publicTokenLimited } from "@/lib/rate-limit";
import { FieldError } from "@/lib/job-field";
import { acceptJob, declineJob } from "@/lib/tech-response";

type Params = { params: Promise<{ token: string }> };

const expiredResponse = () =>
  NextResponse.json({ error: "This job link has expired. Ask the shop for the job details." }, { status: 410 });

async function loadJob(token: string) {
  return prisma.job.findFirst({
    where: { techToken: token },
    include: {
      business: { select: { name: true, timezone: true } },
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
      technician: { select: { id: true, name: true, phone: true } },
    },
  });
}

function serializeTechJob(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>) {
  return {
    title: job.title,
    status: job.status,
    address: job.address,
    urgency: job.urgency,
    serviceType: job.serviceType,
    notes: job.notes,
    etaText: job.etaText,
    accepted: Boolean(job.techAcceptedAt),
    resolutionCode: job.resolutionCode,
    resolutionSummary: job.resolutionSummary,
    finalAmountCents: job.finalAmountCents,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    shopName: job.business.name,
    shopTimezone: job.business.timezone,
    customerName:
      job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? job.lead?.phone ?? null,
    customerPhone: job.customer?.phone ?? job.lead?.phone ?? null,
    technicianName: job.technician?.name ?? null,
  };
}

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "tech", "GET");
  if (limited) return limited;
  const { token } = await params;
  const job = await loadJob(token);
  if (!job) {
    return NextResponse.json({ error: "Job link not found" }, { status: 404 });
  }
  if (techLinkExpired(job)) return expiredResponse();
  return NextResponse.json({ job: serializeTechJob(job) });
}

const patchSchema = z.object({
  status: z.enum(["confirmed", "en_route", "on_site", "completed"]).optional(),
  accept: z.literal(true).optional(),
  decline: z.literal(true).optional(),
  reason: z.string().max(200).optional(),
  etaText: z.string().max(80).optional(),
  resolutionCode: z.string().optional(),
  resolutionSummary: z.string().max(500).optional(),
  finalAmountCents: z.number().int().min(0).max(5_000_000).nullable().optional(),
  noCharge: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "tech", "PATCH");
  if (limited) return limited;
  const { token } = await params;
  const job = await loadJob(token);
  if (!job) {
    return NextResponse.json({ error: "Job link not found" }, { status: 404 });
  }
  if (techLinkExpired(job)) return expiredResponse();

  try {
    const body = patchSchema.parse(await request.json());
    const answering = { id: job.id, businessId: job.businessId, technicianId: job.technicianId };

    if (body.decline) {
      if (!job.technician) return NextResponse.json({ error: "Nobody is on this job. Ask the office." }, { status: 409 });
      await declineJob({ job: answering, technician: job.technician, reason: body.reason });
      return NextResponse.json({ ok: true, declined: true, job: null });
    }
    /* "confirmed" from the field is the technician's yes, never the customer's. */
    if (body.accept || body.status === "confirmed") {
      if (!job.technician) return NextResponse.json({ error: "Nobody is on this job. Ask the office." }, { status: 409 });
      await acceptJob({ job: answering, technician: job.technician });
      if (body.status === "confirmed") body.status = undefined;
    }

    if (body.etaText !== undefined) {
      await prisma.job.update({
        where: { id: job.id },
        data: { etaText: body.etaText.trim() || null },
      });
    }

    if (body.status) {
      if (!isJobStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (body.status === "completed") {
        if (!isJobOutcomeCode(body.resolutionCode)) {
          return NextResponse.json(
            { error: "Choose what happened before completing the job" },
            { status: 400 },
          );
        }
        await transitionJob({
          businessId: job.businessId,
          jobId: job.id,
          to: "completed",
          actor: { kind: "technician" },
          via: "tech_link",
          completion: {
            path: "field",
            resolutionCode: body.resolutionCode,
            resolutionSummary: body.resolutionSummary,
            finalAmountCents: body.finalAmountCents,
            noCharge: body.noCharge,
          },
        });
        await invoiceCompletedJob(job.id).catch((error) =>
          logWarn("invoice.on_complete_failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } else {
        await transitionJob({ businessId: job.businessId, jobId: job.id, to: body.status, actor: { kind: "technician" }, via: "tech_link" });
        if (job.technician && body.status === "en_route") await acceptJob({ job: answering, technician: job.technician });
      }
    }

    // Ensure token stays stable if somehow cleared
    await ensureJobTechToken(job.id);

    const fresh = await loadJob(token);
    return NextResponse.json({
      ok: true,
      job: fresh ? serializeTechJob(fresh) : null,
    });
  } catch (error) {
    if (error instanceof FieldError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof JobTransitionError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
