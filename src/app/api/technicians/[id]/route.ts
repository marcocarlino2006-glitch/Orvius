import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/customer";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

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
  };

  const existing = await prisma.technician.findFirst({
    where: { id, businessId: business.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Technician not found" }, { status: 404 });
  }

  const data: { name?: string; phone?: string | null } = {};

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

  return NextResponse.json({ technician });
}
