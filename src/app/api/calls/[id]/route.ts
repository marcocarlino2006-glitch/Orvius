import { NextResponse } from "next/server";
import { getCustomerTimeline } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** Heuristic review signal — not a model confidence score. */
function needsHumanReview(params: {
  summary: string | null;
  transcript: string | null;
  lead: {
    address: string | null;
    serviceType: string | null;
    urgency: string | null;
    job: { id: string } | null;
  } | null;
}): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!params.summary?.trim() && !params.transcript?.trim()) {
    reasons.push("No summary or transcript captured");
  }
  if (params.lead) {
    if (!params.lead.address?.trim()) reasons.push("Missing service address");
    if (!params.lead.serviceType?.trim()) reasons.push("Service type unclear");
    if (
      params.lead.urgency?.toLowerCase().includes("emergency") &&
      !params.lead.job
    ) {
      reasons.push("Emergency lead not booked yet");
    }
  }
  return { needsReview: reasons.length > 0, reasons };
}

export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
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

  const review = needsHumanReview({
    summary: call.summary,
    transcript: call.transcript,
    lead: call.lead
      ? {
          address: call.lead.address,
          serviceType: call.lead.serviceType,
          urgency: call.lead.urgency,
          job: call.lead.job,
        }
      : null,
  });

  return NextResponse.json({
    call: {
      ...call,
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
      needsReview: review.needsReview,
      reviewReasons: review.reasons,
      priorJobs: priorJobs.map((job) => ({
        ...job,
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
      })),
      timeline: timeline.slice(0, 8),
    },
  });
}
