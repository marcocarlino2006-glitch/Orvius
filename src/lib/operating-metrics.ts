import { prisma } from "@/lib/prisma";
import { findDuplicateJobs } from "@/lib/workspace-hygiene";

export type OperatingMetric = {
  key: string;
  label: string;
  /** 0–1 for rates, a count or cents otherwise; null when there is nothing to measure yet. */
  value: number | null;
  unit: "rate" | "count" | "cents";
  numerator?: number;
  denominator?: number;
  /** Which way is good, so the UI can colour without guessing. */
  goal: "high" | "low";
  note: string;
};

const DAY = 24 * 60 * 60 * 1000;
const MIN_SAMPLE = 5;

function rate(
  key: string,
  label: string,
  numerator: number,
  denominator: number,
  goal: "high" | "low",
  note: string,
): OperatingMetric {
  return {
    key,
    label,
    value: denominator >= MIN_SAMPLE ? numerator / denominator : null,
    unit: "rate",
    numerator,
    denominator,
    goal,
    note: denominator < MIN_SAMPLE ? `${note} Needs ${MIN_SAMPLE}+ to report; ${denominator} so far.` : note,
  };
}

/**
 * The loop's scorecard for one workspace, computed from the records and audit
 * trail — nothing here is self-reported. Rates stay empty until there are
 * enough events to mean something.
 */
export async function getOperatingMetrics(businessId: string, windowDays = 30): Promise<OperatingMetric[]> {
  const since = new Date(Date.now() - windowDays * DAY);
  const inWindow = { businessId, createdAt: { gte: since } };

  const [
    calls,
    answered,
    callLeads,
    completeLeads,
    bookedByOrvius,
    ownerMovedOrvius,
    alertsSent,
    alertsFailed,
    escalated,
    held,
    executed,
    declined,
    webhookOk,
    webhookFailed,
    jobs,
    revenue,
  ] = await Promise.all([
    prisma.call.count({ where: inWindow }),
    prisma.call.count({ where: { ...inWindow, status: "completed" } }),
    prisma.lead.count({ where: { ...inWindow, source: "call" } }),
    prisma.lead.count({
      where: { ...inWindow, source: "call", phone: { not: null }, address: { not: null }, serviceType: { not: null } },
    }),
    prisma.auditEvent.findMany({
      where: { ...inWindow, action: "job.booked", actor: "orvius" },
      select: { jobId: true },
    }),
    prisma.auditEvent.findMany({
      where: {
        ...inWindow,
        actor: "owner",
        action: { in: ["job.rescheduled", "technician.assigned", "technician.unassigned"] },
      },
      select: { jobId: true },
    }),
    prisma.ownerNotification.count({ where: { ...inWindow, status: "sent" } }),
    prisma.ownerNotification.count({ where: { ...inWindow, status: "failed" } }),
    prisma.auditEvent.count({ where: { ...inWindow, action: "lead.escalated" } }),
    prisma.auditEvent.count({ where: { ...inWindow, action: "lead.held" } }),
    prisma.auditEvent.count({ where: { ...inWindow, action: "copilot.executed" } }),
    prisma.auditEvent.count({ where: { ...inWindow, action: "copilot.declined" } }),
    prisma.webhookEvent.count({ where: { ...inWindow, status: "processed" } }),
    prisma.webhookEvent.count({ where: { ...inWindow, status: { in: ["failed", "error"] } } }),
    prisma.job.findMany({
      where: inWindow,
      select: {
        id: true,
        businessId: true,
        customerId: true,
        serviceType: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.payment.aggregate({
      where: {
        businessId,
        createdAt: { gte: since },
        status: { notIn: ["failed", "refunded"] },
        invoice: { job: { lead: { source: "call" } } },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const orvius = new Set(bookedByOrvius.map((a) => a.jobId).filter(Boolean));
  const corrected = new Set(ownerMovedOrvius.map((a) => a.jobId).filter((id) => id && orvius.has(id)));
  const duplicates = findDuplicateJobs(jobs.map((j) => ({ ...j, hasMoney: false }))).length;

  return [
    rate("answer", "Calls answered", answered, calls, "high", "Calls that reached a finished conversation."),
    rate(
      "qualification",
      "Captured completely",
      completeLeads,
      callLeads,
      "high",
      "Call leads with service, address and callback number — the proxy for qualification until owners grade calls.",
    ),
    rate(
      "booking",
      "Booked without correction",
      orvius.size - corrected.size,
      orvius.size,
      "high",
      "Jobs Orvius booked that the owner did not reschedule or reassign.",
    ),
    rate("notify", "Owner alerts delivered", alertsSent, alertsSent + alertsFailed, "high", "SMS and email alerts accepted by the carrier."),
    rate("duplicates", "Duplicate jobs", duplicates, jobs.length, "low", "Same customer and service opened twice within a day."),
    rate("escalation", "Sent to a human", escalated + held, callLeads, "low", "Safety escalations plus leads held for missing details or capacity."),
    rate("actions", "Ask actions completed", executed, executed + declined, "high", "Approved Ask actions against those declined."),
    rate(
      "webhooks",
      "Webhooks processed",
      webhookOk,
      webhookOk + webhookFailed,
      "high",
      "Inbound events handled on first or retried delivery. Uptime itself is measured by the external health monitor.",
    ),
    {
      key: "recovered",
      label: "Jobs booked by Orvius",
      value: orvius.size,
      unit: "count",
      goal: "high",
      note: `Booked from calls in the last ${windowDays} days without the owner touching the phone.`,
    },
    {
      key: "revenue",
      label: "Revenue from call-sourced jobs",
      value: revenue._sum.amountCents ?? 0,
      unit: "cents",
      goal: "high",
      note: "Payments recorded on jobs that started as an Orvius call.",
    },
  ];
}
