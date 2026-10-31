import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { NextResponse } from "next/server";
import { isLeadQualifiedForBooking } from "@/lib/auto-job";
import { safeTimezone, shopWallInputToUtc, zonedWallToUtc } from "@/lib/availability";
import { normalizePhone } from "@/lib/customer";
import { JOB_INCLUDE, OverrideRefusedError, OwnerClashError, createJobFromLead, createOwnerJob, ownerScheduleClash, serializeJob } from "@/lib/job";
import { authorizeScheduleOverride, scheduleOverrideRecord } from "@/lib/scheduling-policy";
import { personActor, recordAudit } from "@/lib/audit";
import { classifyRequest } from "@/lib/trade-playbooks";
import { CLOSED_PAGE, CLOSED_STATUSES, JOB_SEARCH_LIMIT, closedCursor, closedPageWhere, jobSearchWhere } from "@/lib/job-search";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const params = new URL(request.url).searchParams;
  const timezone = safeTimezone(business.timezone);

  const search = jobSearchWhere(business.id, params.get("q") ?? "");
  if (search) {
    const found = await prisma.job.findMany({
      where: search,
      take: JOB_SEARCH_LIMIT + 1,
      orderBy: { updatedAt: "desc" },
      include: JOB_INCLUDE,
    });
    return NextResponse.json({
      jobs: found.slice(0, JOB_SEARCH_LIMIT).map(serializeJob),
      truncated: found.length > JOB_SEARCH_LIMIT,
      timezone,
    });
  }

  const before = params.get("closedBefore");
  const closedPage = () =>
    prisma.job.findMany({
      where: closedPageWhere(business.id, before),
      take: CLOSED_PAGE + 1,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: JOB_INCLUDE,
    });
  const pageOf = (rows: Awaited<ReturnType<typeof closedPage>>) => {
    const page = rows.slice(0, CLOSED_PAGE);
    return { page, next: rows.length > CLOSED_PAGE ? closedCursor(page[page.length - 1]) : null };
  };

  if (before) {
    const { page, next } = pageOf(await closedPage());
    return NextResponse.json({ jobs: page.map(serializeJob), closedNext: next, timezone });
  }

  /* Every open job, then the latest closed ones; one oldest-first cap would drop next week's work. */
  const [open, closed, closedTotal] = await Promise.all([
    prisma.job.findMany({
      where: { businessId: business.id, status: { notIn: CLOSED_STATUSES } },
      take: 300,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      include: JOB_INCLUDE,
    }),
    closedPage(),
    prisma.job.count({ where: { businessId: business.id, status: { in: CLOSED_STATUSES } } }),
  ]);
  const { page, next } = pageOf(closed);

  return NextResponse.json({
    jobs: [...open, ...page].map(serializeJob),
    closedNext: next,
    closedTotal,
    timezone,
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
    allowClash?: boolean;
    reason?: string | null;
  };

  if (!body.leadId?.trim() && body.customer) {
    return bookOwnerJob(business.id, business.timezone, body, {
      ...personActor(authResult),
      role: authResult.role,
      reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null,
    });
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
    const scheduledAt = body.scheduledLocal ? shopWallInputToUtc(body.scheduledLocal, business.timezone) : body.scheduledAt;
    const at = scheduledAt ? new Date(scheduledAt) : null;
    let clash: string | null = null;
    if (at && !Number.isNaN(at.getTime())) {
      const service = classifyRequest({ business, serviceType: lead.serviceType, urgency: null }).service;
      clash = await ownerScheduleClash({
        businessId: business.id,
        at,
        durationMin: service.durationMin,
        skill: service.skill,
        timezone: business.timezone ?? "America/New_York",
        technicianId: null,
      });
      if (clash && body.allowClash !== true) return NextResponse.json({ error: clash, clash: true }, { status: 409 });
    }
    const authority = clash
      ? await authorizeScheduleOverride({
          businessId: business.id,
          actor: { role: authResult.role, email: authResult.email },
          reason: typeof body.reason === "string" ? body.reason : null,
        })
      : null;
    if (authority && !authority.ok) {
      return NextResponse.json({ error: authority.error, clash: true, needsReason: authority.status === 422 }, { status: authority.status });
    }
    const job = await createJobFromLead({
      leadId: body.leadId.trim(),
      scheduledAt,
      notes: body.notes,
    });
    if (clash && authority?.ok) {
      await recordAudit({
        businessId: business.id,
        entityType: "job",
        entityId: job.id,
        jobId: job.id,
        leadId: lead.id,
        ...personActor(authResult),
        action: "job.schedule_override",
        summary: `Booked over a clash: ${clash}`,
        detail: await scheduleOverrideRecord({
          businessId: business.id,
          clash,
          before: { at: null, technicianId: null },
          after: { at, technicianId: job.technicianId ?? null },
          durationMin: job.durationMin ?? DEFAULT_JOB_DURATION_MIN,
          excludeJobId: job.id,
          actor: { role: authResult.role, email: authResult.email },
          authority,
          via: "dashboard",
          notify: { customer: "booking_confirmation", technician: job.technicianId ? "assignment_text" : "none" },
        }),
      });
    }

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
    allowClash?: boolean;
  },
  bookedBy: NonNullable<Parameters<typeof createOwnerJob>[0]["bookedBy"]>,
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

  let job;
  try {
    job = await createOwnerJob({
      businessId,
      name: body.customer?.name?.slice(0, 120),
      phone,
      serviceType,
      address: body.customer?.address?.slice(0, 300),
      notes: body.notes?.slice(0, 1000),
      scheduledAt,
      technicianId,
      allowClash: body.allowClash === true,
      bookedBy,
    });
  } catch (error) {
    if (error instanceof OwnerClashError) return NextResponse.json({ error: error.message, clash: true }, { status: 409 });
    if (error instanceof OverrideRefusedError) {
      return NextResponse.json({ error: error.message, clash: true, needsReason: error.status === 422 }, { status: error.status });
    }
    throw error;
  }
  const full = await prisma.job.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  return NextResponse.json({ job: full ? serializeJob(full) : serializeJob(job) });
}
