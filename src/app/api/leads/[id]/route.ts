import { NextResponse } from "next/server";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const LEAD_INCLUDE = {
  business: { select: { id: true, name: true } },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      interactionCount: true,
    },
  },
  call: {
    select: {
      id: true,
      summary: true,
      transcript: true,
      durationSec: true,
      status: true,
      createdAt: true,
    },
  },
  job: {
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      title: true,
      technicianId: true,
    },
  },
} as const;

function serializeLead(lead: {
  createdAt: Date;
  updatedAt: Date;
  call: { createdAt: Date } | null;
  job: { scheduledAt: Date | null } | null;
  [key: string]: unknown;
}) {
  return {
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    call: lead.call
      ? {
          ...lead.call,
          createdAt: lead.call.createdAt.toISOString(),
        }
      : null,
    job: lead.job
      ? {
          ...lead.job,
          scheduledAt: lead.job.scheduledAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;

  let lead = await prisma.lead.findFirst({
    where: { id, businessId: business.id },
    include: LEAD_INCLUDE,
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!lead.job) {
    await maybeAutoBookLead(lead.id);
    lead = await prisma.lead.findFirst({
      where: { id, businessId: business.id },
      include: LEAD_INCLUDE,
    });
  }

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead: serializeLead(lead) });
}

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (!body.status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  const allowed = new Set(["new", "contacted", "booked", "lost", "spam"]);
  if (!allowed.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.lead.findFirst({
    where: { id, businessId: business.id },
    select: { id: true },
  });
  if (!existing) {
    return forbiddenResponse();
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: { status: body.status },
  });

  return NextResponse.json({ lead });
}
