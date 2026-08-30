import { NextResponse } from "next/server";
import { getCustomerTimeline, customerDisplayName } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true } },
      _count: { select: { leads: true, calls: true, jobs: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const timeline = await getCustomerTimeline(id);

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      displayName: customerDisplayName(customer.name, customer.phone),
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      notes: customer.notes,
      interactionCount: customer.interactionCount,
      firstSeenAt: customer.firstSeenAt.toISOString(),
      lastSeenAt: customer.lastSeenAt.toISOString(),
      business: customer.business,
      leadCount: customer._count.leads,
      callCount: customer._count.calls,
      jobCount: customer._count.jobs,
      returning: customer.interactionCount > 1,
    },
    timeline,
  });
}
