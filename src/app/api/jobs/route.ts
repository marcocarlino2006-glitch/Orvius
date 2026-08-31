import { NextResponse } from "next/server";
import { JOB_INCLUDE, createJobFromLead, serializeJob } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const jobs = await prisma.job.findMany({
    where: { businessId: business.id },
    take: 80,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    include: JOB_INCLUDE,
  });

  return NextResponse.json({
    jobs: jobs.map(serializeJob),
  });
}

export async function POST(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const body = (await request.json()) as {
    leadId?: string;
    scheduledAt?: string | null;
    notes?: string | null;
  };

  if (!body.leadId?.trim()) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { id: body.leadId.trim(), businessId: business.id },
    select: { id: true },
  });
  if (!lead) {
    return forbiddenResponse();
  }

  try {
    const job = await createJobFromLead({
      leadId: body.leadId.trim(),
      scheduledAt: body.scheduledAt,
      notes: body.notes,
    });

    const full = await prisma.job.findUnique({
      where: { id: job.id },
      include: JOB_INCLUDE,
    });

    return NextResponse.json({ job: full ? serializeJob(full) : serializeJob(job) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not book job";
    const status = message === "Lead not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
