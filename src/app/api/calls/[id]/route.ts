import { NextResponse } from "next/server";
import { gradeCall } from "@/lib/call-quality";
import { getCustomerTimeline } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { id } = await params;

  const call = await prisma.call.findFirst({
    where: { id, businessId: business.id },
    include: {
      business: { select: { id: true, name: true, trade: true, servicesJson: true } },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          interactionCount: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
      },
      lead: {
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              scheduledAt: true,
              technicianId: true,
            },
          },
        },
      },
    },
  });

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const priorJobs = call.customerId
    ? await prisma.job.findMany({
        where: {
          businessId: business.id,
          customerId: call.customerId,
          ...(call.lead?.job?.id ? { id: { not: call.lead.job.id } } : {}),
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
        },
      })
    : [];

  const timeline = call.customerId
    ? await getCustomerTimeline(call.customerId)
    : [];

  const actionsTaken: string[] = [];
  if (call.ownerNotifiedAt) actionsTaken.push("Owner alerted");
  if (call.booked || call.lead?.job) actionsTaken.push("Job booked");
  if (call.lead?.status === "contacted") actionsTaken.push("Marked contacted");
  if (call.lead?.status === "new" && !call.lead.job) {
    actionsTaken.push("Lead waiting in inbox");
  }
  if (call.customer) actionsTaken.push("Customer record linked");

  const quality = gradeCall({ call, lead: call.lead, business: call.business ?? undefined, knownAddress: call.customer?.address });

  return NextResponse.json({
    call: {
      ...call,
      business: call.business ? { id: call.business.id, name: call.business.name } : null,
      createdAt: call.createdAt.toISOString(),
      updatedAt: call.updatedAt.toISOString(),
      ownerNotifiedAt: call.ownerNotifiedAt?.toISOString() ?? null,
      lead: call.lead
        ? {
            ...call.lead,
            createdAt: call.lead.createdAt.toISOString(),
            updatedAt: call.lead.updatedAt.toISOString(),
            job: call.lead.job
              ? {
                  ...call.lead.job,
                  scheduledAt: call.lead.job.scheduledAt?.toISOString() ?? null,
                }
              : null,
          }
        : null,
      customer: call.customer
        ? {
            ...call.customer,
            firstSeenAt: call.customer.firstSeenAt.toISOString(),
            lastSeenAt: call.customer.lastSeenAt.toISOString(),
          }
        : null,
    },
    situation: {
      actionsTaken,
      quality,
      priorJobs: priorJobs.map((job) => ({
        ...job,
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
      })),
      timeline: timeline.slice(0, 8),
    },
  });
}
