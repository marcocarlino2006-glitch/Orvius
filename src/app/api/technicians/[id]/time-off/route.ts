import { NextResponse } from "next/server";
import { z } from "zod";
import { personActor, recordAudit } from "@/lib/audit";
import { shopDayBounds } from "@/lib/availability";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requirePermission, type requireEntitledSession } from "@/lib/tenant";
import { handOffTechnicianJobs } from "@/lib/tech-handoff";

type Params = { params: Promise<{ id: string }> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addSchema = z.object({
  from: z.string().regex(DAY, "Pick a start day"),
  to: z.string().regex(DAY, "Pick an end day"),
  reason: z.string().trim().max(60).optional(),
});

type Scoped =
  | { error: Response }
  | { auth: Extract<Awaited<ReturnType<typeof requireEntitledSession>>, { business: unknown }>; technician: { id: string; name: string } };

async function scope(params: Params["params"]): Promise<Scoped> {
  const authResult = await requirePermission("team.manage");
  if ("error" in authResult) return { error: authResult.error! };
  const planGate = requirePlanModule(authResult.business, "dispatch");
  if ("error" in planGate) return { error: planGate.error };
  const { id } = await params;
  const technician = await prisma.technician.findFirst({
    where: { id, businessId: authResult.business.id },
    select: { id: true, name: true },
  });
  if (!technician) return { error: NextResponse.json({ error: "Technician not found" }, { status: 404 }) };
  return { auth: authResult, technician };
}

/**
 * Whole days off, read in the shop's timezone: "Mon 12 to Wed 14" is midnight
 * Monday through midnight Thursday. Jobs already booked on the technician
 * inside the window come off them and go to someone else when one person
 * clearly fits; the response says where each one landed.
 */
export async function POST(request: Request, { params }: Params) {
  const s = await scope(params);
  if ("error" in s) return s.error;
  const { auth, technician } = s;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid time off" }, { status: 400 });
  }
  const { from, to, reason } = parsed.data;
  if (to < from) return NextResponse.json({ error: "The last day can't be before the first" }, { status: 400 });

  const timezone = auth.business.timezone ?? "America/New_York";
  const startsAt = shopDayBounds(from, timezone).start;
  const endsAt = shopDayBounds(to, timezone).end;
  if (endsAt.getTime() - startsAt.getTime() > 366 * 24 * 60 * 60_000) {
    return NextResponse.json({ error: "Time off can be up to a year at a time" }, { status: 400 });
  }

  const entry = await prisma.technicianTimeOff.create({
    data: { businessId: auth.business.id, technicianId: technician.id, startsAt, endsAt, reason: reason || null },
  });
  const affected = await handOffTechnicianJobs({
    businessId: auth.business.id,
    technician,
    from: startsAt,
    to: endsAt,
    why: `${technician.name} is off`,
    actor: personActor(auth),
  });

  await recordAudit({
    businessId: auth.business.id,
    entityType: "technician",
    entityId: technician.id,
    action: "technician.time_off",
    ...personActor(auth),
    summary: `${technician.name} is off ${from === to ? from : `${from} to ${to}`}${reason ? ` · ${reason}` : ""}.`,
    detail: { timeOffId: entry.id, from, to, affectedJobIds: affected.map((j) => j.id) },
  });

  return NextResponse.json({
    timeOff: { id: entry.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: entry.reason },
    affected,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const s = await scope(params);
  if ("error" in s) return s.error;
  const { auth, technician } = s;
  const entryId = new URL(request.url).searchParams.get("entry");
  if (!entryId) return NextResponse.json({ error: "entry required" }, { status: 400 });
  const removed = await prisma.technicianTimeOff.deleteMany({
    where: { id: entryId, technicianId: technician.id, businessId: auth.business.id },
  });
  if (!removed.count) return NextResponse.json({ error: "Time off not found" }, { status: 404 });
  await recordAudit({
    businessId: auth.business.id,
    entityType: "technician",
    entityId: technician.id,
    action: "technician.time_off_removed",
    ...personActor(auth),
    summary: `Removed time off for ${technician.name}.`,
    detail: { timeOffId: entryId },
  });
  return NextResponse.json({ ok: true });
}
