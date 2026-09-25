import { prisma } from "@/lib/prisma";

export type ShiftEventKind =
  | "call_captured"
  | "lead_captured"
  | "job_booked"
  | "job_completed"
  | "owner_alerted"
  | "deposit_sent"
  | "deposit_paid"
  | "payment_recorded";

export type ShiftEventTone =
  | "agent"
  | "success"
  | "attention"
  | "neutral";

export type PipelineProofStage = "call" | "lead" | "job" | "alert" | "money";

export type ShiftEvent = {
  key: string;
  kind: ShiftEventKind;
  tone: ShiftEventTone;
  at: string;
  title: string;
  detail: string | null;
  href: string | null;
  amountCents: number | null;
  proves: PipelineProofStage[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_LIMIT = 24;
const FEED_LIMIT = 32;

function compact(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}

function withPerson(label: string, name: string | null | undefined) {
  const person = compact(name);
  return person ? `${label} · ${person}` : label;
}

/**
 * A measured audit of the current shift.
 *
 * This deliberately does not infer revenue, resolutions, alerts, or agent
 * actions. Every row requires the record or lifecycle timestamp that proves it
 * happened. Call-backed leads collapse into the call row so one inbound touch
 * cannot pose as two wins.
 */
export async function getShiftTimeline(
  businessId: string,
  since = new Date(Date.now() - DAY_MS),
): Promise<ShiftEvent[]> {
  const [calls, standaloneLeads, jobs, notifications, deposits, payments] =
    await Promise.all([
      prisma.call.findMany({
        where: { businessId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          status: true,
          summary: true,
          createdAt: true,
          lead: {
            select: {
              id: true,
              name: true,
              serviceType: true,
              urgency: true,
            },
          },
        },
      }),
      prisma.lead.findMany({
        where: { businessId, callId: null, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          name: true,
          serviceType: true,
          source: true,
          createdAt: true,
          job: { select: { createdAt: true } },
        },
      }),
      prisma.job.findMany({
        where: {
          businessId,
          OR: [
            { createdAt: { gte: since } },
            { completedAt: { gte: since } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          completedAt: true,
          resolutionSummary: true,
          finalAmountCents: true,
          lead: { select: { source: true } },
        },
      }),
      prisma.ownerNotification.findMany({
        where: {
          businessId,
          status: "sent",
          processedAt: { gte: since },
        },
        orderBy: { processedAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          leadId: true,
          channel: true,
          processedAt: true,
        },
      }),
      prisma.deposit.findMany({
        where: {
          businessId,
          OR: [{ sentAt: { gte: since } }, { paidAt: { gte: since } }],
        },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          leadId: true,
          jobId: true,
          amountCents: true,
          sentAt: true,
          paidAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { businessId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
        select: {
          id: true,
          amountCents: true,
          method: true,
          createdAt: true,
          invoice: { select: { jobId: true } },
        },
      }),
    ]);

  const events: ShiftEvent[] = [];

  for (const call of calls) {
    const service = compact(call.lead?.serviceType) ?? "service call";
    events.push({
      key: `call_captured:${call.id}`,
      kind: "call_captured",
      tone: "agent",
      at: call.createdAt.toISOString(),
      title: withPerson(`Call: ${service}`, call.lead?.name),
      detail: compact(call.summary) ?? `Call status: ${call.status}`,
      href: `/dashboard/calls/${call.id}`,
      amountCents: null,
      proves: call.lead ? ["call", "lead"] : ["call"],
    });
  }

  for (const lead of standaloneLeads) {
    if (lead.job?.createdAt && lead.job.createdAt >= since) continue;
    const service = compact(lead.serviceType) ?? "service request";
    events.push({
      key: `lead_captured:${lead.id}`,
      kind: "lead_captured",
      tone: "agent",
      at: lead.createdAt.toISOString(),
      title: withPerson(`Request: ${service}`, lead.name),
      detail: `Source: ${lead.source}`,
      href: `/dashboard/inbox/${lead.id}`,
      amountCents: null,
      proves: ["lead"],
    });
  }

  for (const job of jobs) {
    if (job.createdAt >= since) {
      events.push({
        key: `job_booked:${job.id}`,
        kind: "job_booked",
        tone: "agent",
        at: job.createdAt.toISOString(),
        title: `Booked ${job.title}`,
        detail: job.lead?.source
          ? `Captured from ${job.lead.source} · Job status: ${job.status}`
          : `Job status: ${job.status}`,
        href: `/dashboard/jobs/${job.id}`,
        amountCents: null,
        proves: ["job"],
      });
    }
    if (job.completedAt && job.completedAt >= since) {
      events.push({
        key: `job_completed:${job.id}`,
        kind: "job_completed",
        tone: "success",
        at: job.completedAt.toISOString(),
        title: `Completed ${job.title}`,
        detail: compact(job.resolutionSummary),
        href: `/dashboard/jobs/${job.id}`,
        amountCents: job.finalAmountCents,
        proves: ["job"],
      });
    }
  }

  for (const notification of notifications) {
    if (!notification.processedAt) continue;
    const channel = notification.channel.toUpperCase();
    events.push({
      key: `owner_alerted:${notification.id}:${notification.channel}`,
      kind: "owner_alerted",
      tone: "neutral",
      at: notification.processedAt.toISOString(),
      title: `Owner alerted by ${channel}`,
      detail: "Delivery accepted by the provider",
      href: notification.leadId
        ? `/dashboard/inbox/${notification.leadId}`
        : null,
      amountCents: null,
      proves: ["alert"],
    });
  }

  for (const deposit of deposits) {
    const href = deposit.jobId
      ? `/dashboard/jobs/${deposit.jobId}`
      : deposit.leadId
        ? `/dashboard/inbox/${deposit.leadId}`
        : null;
    if (deposit.sentAt && deposit.sentAt >= since) {
      events.push({
        key: `deposit_sent:${deposit.id}`,
        kind: "deposit_sent",
        tone: "attention",
        at: deposit.sentAt.toISOString(),
        title: "Deposit request sent",
        detail: "Awaiting customer payment",
        href,
        amountCents: deposit.amountCents,
        proves: ["money"],
      });
    }
    if (deposit.paidAt && deposit.paidAt >= since) {
      events.push({
        key: `deposit_paid:${deposit.id}`,
        kind: "deposit_paid",
        tone: "success",
        at: deposit.paidAt.toISOString(),
        title: "Booking deposit paid",
        detail: "Funds settle directly to the shop",
        href,
        amountCents: deposit.amountCents,
        proves: ["money"],
      });
    }
  }

  for (const payment of payments) {
    events.push({
      key: `payment_recorded:${payment.id}`,
      kind: "payment_recorded",
      tone: "success",
      at: payment.createdAt.toISOString(),
      title: "Payment recorded",
      detail: compact(payment.method)
        ? `Method: ${payment.method}`
        : null,
      href: payment.invoice.jobId
        ? `/dashboard/jobs/${payment.invoice.jobId}`
        : null,
      amountCents: payment.amountCents,
      proves: ["money"],
    });
  }

  return events
    .sort((a, b) => {
      const byTime = b.at.localeCompare(a.at);
      return byTime || a.key.localeCompare(b.key);
    })
    .slice(0, FEED_LIMIT);
}
