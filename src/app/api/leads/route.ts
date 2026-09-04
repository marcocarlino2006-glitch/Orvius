import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

const VALID_STATUSES = new Set(["new", "contacted", "booked", "lost", "spam"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status")?.trim() || null;
  const limit = Math.min(
    Number(searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = searchParams.get("cursor")?.trim() || null;

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const tenant = { businessId: business.id };
  const where = status ? { ...tenant, status } : tenant;

  const leads = await prisma.lead.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: { createdAt: "desc" },
    include: {
      business: { select: { name: true } },
      customer: { select: { id: true, name: true, interactionCount: true } },
      job: { select: { id: true, status: true } },
    },
  });

  const hasMore = leads.length > limit;
  const items = hasMore ? leads.slice(0, limit) : leads;

  return NextResponse.json({
    leads: items.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
      business: lead.business,
      customer: lead.customer,
      job: lead.job,
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    counts: {
      total: await prisma.lead.count({ where: tenant }),
      new: await prisma.lead.count({ where: { ...tenant, status: "new" } }),
      contacted: await prisma.lead.count({ where: { ...tenant, status: "contacted" } }),
      booked: await prisma.lead.count({ where: { ...tenant, status: "booked" } }),
    },
  });
}
