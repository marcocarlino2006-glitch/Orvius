import { NextResponse } from "next/server";
import { customerDisplayName, interactionFloor } from "@/lib/customer";
import { summarizeCustomerMoney, type CustomerMoney } from "@/lib/customer-money";
import { RECEIPT_STATUSES } from "@/lib/payment-math";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

/** Money on the list is summed from at most this many of the listed customers' latest jobs; past it the reply says so. */
const MONEY_JOB_CAP = 5000;

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "customers");
  if ("error" in planGate) return planGate.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const tenant = { businessId: business.id };

  const rows = await prisma.customer.findMany({
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
    take: limit + 1,
    include: {
      business: { select: { name: true } },
      _count: { select: { leads: true, calls: true, jobs: true } },
    },
  });
  const hasMore = rows.length > limit;
  const customers = rows.slice(0, limit);

  /* Lifetime value from their invoices: paid bills at face, open bills by balance left. */
  const moneyByCustomer = new Map<string, CustomerMoney>();
  let moneyPartial = false;
  if (customers.length) {
    const jobs = await prisma.job.findMany({
      where: { businessId: business.id, customerId: { in: customers.map((c) => c.id) } },
      select: {
        customerId: true,
        invoices: {
          select: {
            amountCents: true,
            status: true,
            payments: { where: { status: { in: [...RECEIPT_STATUSES] } }, select: { amountCents: true, status: true, refundedCents: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MONEY_JOB_CAP + 1,
    });
    moneyPartial = jobs.length > MONEY_JOB_CAP;
    for (const [id, slot] of summarizeCustomerMoney(jobs.slice(0, MONEY_JOB_CAP))) moneyByCustomer.set(id, slot);
  }

  return NextResponse.json({
    customers: customers.map((customer) => {
      const money = moneyByCustomer.get(customer.id) ?? { collected: 0, owed: 0, refunded: 0 };
      return {
        id: customer.id,
        name: customer.name,
        displayName: customerDisplayName(customer.name, customer.phone),
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        /* Never show fewer interactions than the records prove — a
           "Returning" customer with "1 interaction" contradicts itself. */
        interactionCount: interactionFloor(customer.interactionCount, customer._count),
        firstSeenAt: customer.firstSeenAt.toISOString(),
        lastSeenAt: customer.lastSeenAt.toISOString(),
        business: customer.business,
        leadCount: customer._count.leads,
        callCount: customer._count.calls,
        collectedCents: money.collected,
        owedCents: money.owed,
        refundedCents: money.refunded,
        returning:
          customer.interactionCount > 1 ||
          customer._count.leads > 1 ||
          customer._count.calls > 1 ||
          customer._count.jobs > 1,
      };
    }),
    total: customers.length,
    hasMore,
    moneyPartial,
  });
}
