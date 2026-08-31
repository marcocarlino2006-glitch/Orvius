import { NextResponse } from "next/server";
import { listCrew } from "@/lib/field";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const technicians = await listCrew(business.id);
  return NextResponse.json({ technicians });
}

export async function POST(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const body = (await request.json()) as { name?: string; phone?: string | null };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const technician = await prisma.technician.create({
    data: {
      businessId: business.id,
      name,
      phone: body.phone?.trim() || null,
      role: "tech",
    },
  });

  return NextResponse.json({ technician });
}
