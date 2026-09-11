import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/customer";
import { listCrew } from "@/lib/field";
import { getPlanTechLimit, requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const technicians = await listCrew(business.id);
  return NextResponse.json({ technicians });
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "dispatch");
  if ("error" in planGate) return planGate.error;

  const body = (await request.json()) as { name?: string; phone?: string | null };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? null);
  if (!phone) {
    return NextResponse.json(
      { error: "Mobile phone required — techs get job SMS when assigned." },
      { status: 400 },
    );
  }

  const limit = getPlanTechLimit(business);
  if (limit != null) {
    const count = await prisma.technician.count({
      where: { businessId: business.id },
    });
    if (count >= limit) {
      return NextResponse.json(
        {
          error: `This plan allows ${limit} technicians. Upgrade to Fleet for unlimited crew.`,
          upgrade: "fleet",
        },
        { status: 402 },
      );
    }
  }

  try {
    const technician = await prisma.technician.create({
      data: {
        businessId: business.id,
        name,
        phone,
        role: "tech",
      },
    });

    return NextResponse.json({ technician });
  } catch (error) {
    /*
      P2002 is the unique on (businessId, name). Saying so beats a 500: the
      form's whole job is to name a person, and two people on one crew with the
      same name cannot be told apart on the board anyway.
    */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `${name} is already on your crew.` },
        { status: 409 },
      );
    }
    throw error;
  }
}
