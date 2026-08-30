import { NextResponse } from "next/server";
import { getDispatchBoard } from "@/lib/field";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const day = url.searchParams.get("day");

  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const board = await getDispatchBoard(business.id, day);
  return NextResponse.json({ business, ...board });
}
