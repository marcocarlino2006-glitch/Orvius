import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerDisplayName } from "@/lib/customer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { phoneNormalized: { contains: q.replace(/\D/g, "") } },
            { email: { contains: q } },
            { address: { contains: q } },
          ],
        }
      : undefined,
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
