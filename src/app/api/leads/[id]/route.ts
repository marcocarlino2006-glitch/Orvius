import { NextResponse } from "next/server";
import { maybeAutoBookLead } from "@/lib/auto-job";
import { linkTouchToCustomer } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

/** Statuses a lead does not come back from, so the clock stops here. */
const TERMINAL_STATUSES = new Set(["booked", "lost", "spam"]);
const leadPatchSchema = z
  .object({
    status: z.enum(["new", "contacted", "booked", "lost", "spam"]).optional(),
    name: z.string().max(120).optional(),
    phone: z.string().min(10).max(32).optional(),
    serviceType: z.string().max(160).optional(),
    urgency: z
      .enum(["emergency", "same-day", "this-week", "flexible"])
      .optional(),
    address: z.string().max(240).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "No changes supplied");

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
  const parsed = leadPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((item) => item.message).join(", ") },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const existing = await prisma.lead.findFirst({
    where: { id, businessId: business.id },
    select: { id: true, callId: true, firstContactedAt: true },
  });
  if (!existing) {
    return forbiddenResponse();
  }

  // Stamped from the status change rather than asked for, so the shop pays no
  // attention tax and "how fast did we answer, and did we win" stays answerable.
  const now = new Date();
  const worked = body.status !== undefined && body.status !== "new";
  const terminal = body.status ? TERMINAL_STATUSES.has(body.status) : false;

  await prisma.lead.update({
    where: { id },
    data: {
      status: body.status,
      name: body.name?.trim(),
      phone: body.phone?.trim(),
      serviceType: body.serviceType?.trim(),
      urgency: body.urgency,
      address: body.address?.trim(),
      notes: body.notes?.trim(),
      firstContactedAt:
        worked && !existing.firstContactedAt ? now : undefined,
      closedAt: body.status ? (terminal ? now : null) : undefined,
    },
  });

  if (body.phone) {
    await linkTouchToCustomer({
      businessId: business.id,
      leadId: id,
      callId: existing.callId ?? undefined,
      phone: body.phone,
      name: body.name,
      address: body.address,
      notes: body.notes,
    });
  }

  const qualificationChanged = Boolean(
    body.phone ||
      body.serviceType ||
      body.address ||
      body.urgency,
  );
  const autoBook =
    qualificationChanged && !terminal
      ? await maybeAutoBookLead(id)
      : null;
  const lead = await prisma.lead.findFirst({
    where: { id, businessId: business.id },
    include: LEAD_INCLUDE,
  });

  return NextResponse.json({
    lead: lead ? serializeLead(lead) : null,
    autoBook,
  });
}
