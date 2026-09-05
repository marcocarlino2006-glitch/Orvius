import { NextResponse } from "next/server";
import { ensureJobTechToken } from "@/lib/ensure-tech-token";
import { isJobStatus, updateJobStatus } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ token: string }> };

async function loadJob(token: string) {
  return prisma.job.findFirst({
    where: { techToken: token },
    include: {
      business: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
      technician: { select: { name: true, phone: true } },
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
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    shopName: job.business.name,
    customerName:
      job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? job.lead?.phone ?? null,
    customerPhone: job.customer?.phone ?? job.lead?.phone ?? null,
    technicianName: job.technician?.name ?? null,
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const job = await loadJob(token);
  if (!job) {
    return NextResponse.json({ error: "Job link not found" }, { status: 404 });
  }
  return NextResponse.json({ job: serializeTechJob(job) });
}

const patchSchema = z.object({
  status: z.enum(["confirmed", "en_route", "on_site", "completed"]).optional(),
  etaText: z.string().max(80).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { token } = await params;
  const job = await loadJob(token);
  if (!job) {
    return NextResponse.json({ error: "Job link not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await request.json());

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
      await updateJobStatus(job.id, body.status);
    }

    // Ensure token stays stable if somehow cleared
    await ensureJobTechToken(job.id);

    const fresh = await loadJob(token);
    return NextResponse.json({
      ok: true,
      job: fresh ? serializeTechJob(fresh) : null,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
