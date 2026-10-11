import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { getPlanTechLimit } from "@/lib/plan-gate";
import { handOffTechnicianJobs, type HandedOffJob } from "@/lib/tech-handoff";
import { revokeTechAppLink } from "@/lib/tech-app";
import { publicTechnician } from "@/lib/tech-app-link";
import { normalizePhone } from "@/lib/customer";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";
import { skillOptions } from "@/lib/trade-playbooks";
import { parseTechHours } from "@/lib/tech-hours";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    phone?: string | null;
    skills?: string[];
    /** Weekday → { open, close, closed }; null goes back to the shop's hours. */
    hours?: unknown;
    /** false takes them off the team: their upcoming jobs are handed off and their app link stops working. */
    active?: boolean;
  };

  const existing = await prisma.technician.findFirst({
    where: { id, businessId: business.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Technician not found" }, { status: 404 });
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "active must be true or false" }, { status: 400 });
    return setActive(authResult, existing, body.active);
  }

  const data: { name?: string; phone?: string | null; skillsJson?: string; hoursJson?: string } = {};

  if (body.hours !== undefined) {
    const hours = body.hours === null ? {} : parseTechHours(body.hours);
    if (!hours) {
      return NextResponse.json({ error: "Hours need a start before the end, like 07:00 to 15:30" }, { status: 400 });
    }
    data.hoursJson = JSON.stringify(hours);
  }

  if (body.skills !== undefined) {
    const known = new Set(skillOptions(null).map((s) => s.key));
    if (!Array.isArray(body.skills) || body.skills.some((s) => typeof s !== "string" || !known.has(s))) {
      return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
    }
    data.skillsJson = JSON.stringify([...new Set(body.skills)]);
  }

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    data.name = name;
  }

  if (body.phone !== undefined) {
    if (body.phone === null || body.phone.trim() === "") {
      data.phone = null;
    } else {
      const phone = normalizePhone(body.phone);
      if (!phone) {
        return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
      }
      data.phone = phone;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const technician = await prisma.technician.update({
    where: { id },
    data,
  });

  return NextResponse.json({ technician: publicTechnician(technician) });
}

async function setActive(
  auth: Extract<Awaited<ReturnType<typeof requireEntitledSession>>, { business: unknown }>,
  existing: { id: string; name: string; isActive: boolean },
  active: boolean,
) {
  const { business } = auth;
  if (existing.isActive === active) {
    const technician = await prisma.technician.findUniqueOrThrow({ where: { id: existing.id } });
    return NextResponse.json({ technician: publicTechnician(technician), handedOff: [] });
  }
  if (active) {
    const limit = getPlanTechLimit(business);
    if (limit != null && (await prisma.technician.count({ where: { businessId: business.id, isActive: true } })) >= limit) {
      return NextResponse.json({ error: `This plan allows ${limit} technicians. Upgrade to Fleet for unlimited crew.`, upgrade: "fleet" }, { status: 402 });
    }
  }
  await prisma.technician.update({ where: { id: existing.id }, data: { isActive: active } });
  let handedOff: HandedOffJob[] = [];
  if (!active) {
    await revokeTechAppLink({ businessId: business.id, technicianId: existing.id, actorEmail: auth.email, actor: auth.role === "owner" ? "owner" : "teammate" }).catch(() => undefined);
    handedOff = await handOffTechnicianJobs({
      businessId: business.id,
      technician: existing,
      from: new Date(),
      why: `${existing.name} is off the team`,
      actor: personActor(auth),
    });
  }
  await recordAudit({
    businessId: business.id,
    entityType: "technician",
    entityId: existing.id,
    action: active ? "technician.reactivated" : "technician.deactivated",
    ...personActor(auth),
    summary: active ? `${existing.name} is back on the team.` : `${existing.name} is off the team. ${handedOff.length} upcoming job(s) handed off.`,
    detail: { handedOffJobIds: handedOff.map((j) => j.id) },
  });
  const technician = await prisma.technician.findUniqueOrThrow({ where: { id: existing.id } });
  return NextResponse.json({ technician: publicTechnician(technician), handedOff });
}
