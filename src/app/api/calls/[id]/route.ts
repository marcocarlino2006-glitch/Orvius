import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;

  const call = await prisma.call.findFirst({
    where: { id, businessId: business.id },
    include: {
      business: { select: { id: true, name: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          interactionCount: true,
        },
      },
      lead: true,
    },
  });

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  return NextResponse.json({
    call: {
      ...call,
      createdAt: call.createdAt.toISOString(),
      updatedAt: call.updatedAt.toISOString(),
      lead: call.lead
        ? {
            ...call.lead,
            createdAt: call.lead.createdAt.toISOString(),
            updatedAt: call.lead.updatedAt.toISOString(),
          }
        : null,
    },
  });
}
