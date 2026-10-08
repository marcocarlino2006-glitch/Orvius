import { NextResponse } from "next/server";
import { isLeadQualifiedForBooking } from "@/lib/auto-job";
import { safeTimezone, shopWallInputToUtc, zonedWallToUtc } from "@/lib/availability";
import { normalizePhone } from "@/lib/customer";
import { JOB_INCLUDE, createJobFromLead, createOwnerJob, serializeJob } from "@/lib/job";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  /* Every open job, then the latest closed ones; one oldest-first cap would drop next week's work. */
  const [open, closed] = await Promise.all([
    prisma.job.findMany({
      where: { businessId: business.id, status: { notIn: ["completed", "cancelled"] } },
      take: 300,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      include: JOB_INCLUDE,
    }),
    prisma.job.findMany({
      where: { businessId: business.id, status: { in: ["completed", "cancelled"] } },
      take: 60,
      orderBy: { updatedAt: "desc" },
      include: JOB_INCLUDE,
    }),
  ]);
  const jobs = [...open, ...closed];

  return NextResponse.json({
    jobs: jobs.map(serializeJob),
    timezone: safeTimezone(business.timezone),
  });
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const body = (await request.json()) as {
    leadId?: string;
    scheduledAt?: string | null;
    scheduledLocal?: string | null;
    notes?: string | null;
    customer?: { name?: string | null; phone?: string | null; address?: string | null };
    serviceType?: string | null;
    technicianId?: string | null;
  };

  if (!body.leadId?.trim() && body.customer) {
    return bookOwnerJob(business.id, business.timezone, body);
  }

  if (!body.leadId?.trim()) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { id: body.leadId.trim(), businessId: business.id },
    select: {
      id: true,
      phone: true,
      name: true,
      serviceType: true,
      address: true,
      categoryCode: true,
    },
  });
  if (!lead) {
    return forbiddenResponse();
  }
  if (!isLeadQualifiedForBooking(lead)) {
    return NextResponse.json(
      {
        error:
          "Complete the caller phone and service details before booking.",
        code: "lead_needs_details",
      },
      { status: 422 },
    );
  }

  try {
    const job = await createJobFromLead({
      leadId: body.leadId.trim(),
      scheduledAt: body.scheduledLocal ? shopWallInputToUtc(body.scheduledLocal, business.timezone) : body.scheduledAt,
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

async function bookOwnerJob(
  businessId: string,
  timezone: string | null,
  body: {
    scheduledAt?: string | null;
    /** The time as the owner typed it, read in the shop's timezone rather than the browser's. */
    scheduledLocal?: string | null;
    notes?: string | null;
    customer?: { name?: string | null; phone?: string | null; address?: string | null };
    serviceType?: string | null;
    technicianId?: string | null;
  },
) {
  const phone = normalizePhone(body.customer?.phone);
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "Enter the customer's mobile so they get the confirmation." }, { status: 422 });
  }
  const serviceType = body.serviceType?.trim().slice(0, 120);
  if (!serviceType) {
    return NextResponse.json({ error: "Say what the job is." }, { status: 422 });
  }
  const wall = body.scheduledLocal?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const scheduledAt = wall
    ? zonedWallToUtc(+wall[1], +wall[2], +wall[3], +wall[4], +wall[5], 0, safeTimezone(timezone ?? "America/New_York"))
    : body.scheduledAt
      ? new Date(body.scheduledAt)
      : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Pick a time." }, { status: 422 });
  }
  const technicianId = body.technicianId?.trim() || null;
  if (technicianId) {
    const tech = await prisma.technician.findFirst({
      where: { id: technicianId, businessId, isActive: true },
      select: { id: true },
    });
    if (!tech) return forbiddenResponse();
  }

  const job = await createOwnerJob({
    businessId,
    name: body.customer?.name?.slice(0, 120),
    phone,
    serviceType,
    address: body.customer?.address?.slice(0, 300),
    notes: body.notes?.slice(0, 1000),
    scheduledAt,
    technicianId,
  });
  const full = await prisma.job.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  return NextResponse.json({ job: full ? serializeJob(full) : serializeJob(job) });
}
