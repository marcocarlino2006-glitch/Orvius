import { NextResponse } from "next/server";
import { customerDisplayName } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const tenant = { businessId: business.id };

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          ...tenant,
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { phoneNormalized: { contains: q.replace(/\D/g, "") } },
            { email: { contains: q } },
            { address: { contains: q } },
          ],
        }
      : tenant,
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    include: {
      business: { select: { name: true } },
      _count: { select: { leads: true, calls: true } },
    },
  });

  return NextResponse.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      displayName: customerDisplayName(customer.name, customer.phone),
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      interactionCount: customer.interactionCount,
      firstSeenAt: customer.firstSeenAt.toISOString(),
      lastSeenAt: customer.lastSeenAt.toISOString(),
      business: customer.business,
      leadCount: customer._count.leads,
      callCount: customer._count.calls,
      returning: customer.interactionCount > 1,
    })),
    total: customers.length,
  });
}
