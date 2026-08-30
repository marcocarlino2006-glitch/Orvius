import { NextResponse } from "next/server";
import { listCrew } from "@/lib/field";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) {
    return NextResponse.json({ technicians: [] });
  }
  const technicians = await listCrew(business.id);
  return NextResponse.json({ technicians });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; phone?: string | null };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
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
