import { NextResponse } from "next/server";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { linkTouchToCustomer } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** Statuses a lead does not come back from, so the clock stops here. */
const TERMINAL_STATUSES = new Set(["booked", "lost", "spam"]);

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

  if (!lead.customerId && lead.phone) {
    await linkTouchToCustomer({
      businessId: business.id,
      leadId: lead.id,
      callId: lead.callId ?? undefined,
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      address: lead.address,
      notes: lead.notes,
    });
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
    select: { id: true, firstContactedAt: true },
  });
  if (!existing) {
    return forbiddenResponse();
  }

  // Stamped from the status change rather than asked for, so the shop pays no
  // attention tax and "how fast did we answer, and did we win" stays answerable.
  const now = new Date();
  const worked = body.status !== "new";
  const terminal = TERMINAL_STATUSES.has(body.status);

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      status: body.status,
      firstContactedAt:
        worked && !existing.firstContactedAt ? now : undefined,
      closedAt: terminal ? now : null,
    },
  });

  return NextResponse.json({ lead });
}
