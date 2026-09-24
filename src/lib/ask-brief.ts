import { prisma } from "@/lib/prisma";
import type { MemoryHit } from "@/lib/shop-memory";
import { recommendTechnician } from "@/lib/technician-match";
import { classifyRequest } from "@/lib/trade-playbooks";

export type AskRecommendation = {
  action: "assign_tech" | "sms_followup" | "mark_contacted";
  label: string;
  reason: string;
  /** Record the action changes — also one of the cited hits. */
  recordType: "job" | "lead";
  recordId: string;
  jobId?: string;
  leadId?: string;
  technicianId?: string;
};

export type AskBrief = {
  matters: string[];
  uncertainty: string[];
  recommendation: AskRecommendation | null;
};

const HOUR_MS = 60 * 60 * 1000;
const STALE_MS = 14 * 24 * HOUR_MS;
const OPEN_JOB = ["scheduled", "confirmed"];

function ago(date: Date, now: number) {
  const hours = Math.max(0, Math.round((now - date.getTime()) / HOUR_MS));
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

function when(date: Date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Turn the records an answer cited into what the owner should notice, what
 * Orvius is unsure about, and the single action most worth taking. Only cited
 * records (and the open work of cited customers) are considered, so the
 * recommendation can always be traced back to evidence on screen.
 */
export async function buildAskBrief(params: {
  businessId: string;
  hits: MemoryHit[];
  modelWorded: boolean;
  now?: Date;
}): Promise<AskBrief> {
  const now = (params.now ?? new Date()).getTime();
  const matters: string[] = [];
  const uncertainty: string[] = [];

  const record = params.hits.filter((h) => h.type !== "operate");
  if (!record.length) {
    uncertainty.push("No individual records matched this question, so the answer comes from shop totals.");
    return { matters, uncertainty, recommendation: null };
  }
  if (params.modelWorded) {
    uncertainty.push("The wording is generated; every fact in it should match a cited record below.");
  }
  const newest = Math.max(...record.map((h) => new Date(h.observedAt).getTime()).filter(Number.isFinite));
  if (Number.isFinite(newest) && now - newest > STALE_MS) {
    uncertainty.push(`The newest matching record is ${ago(new Date(newest), now)} old — something newer may not be captured.`);
  }

  const ids = (type: MemoryHit["type"]) => record.filter((h) => h.type === type).map((h) => h.id);
  const customerIds = ids("customer");

  const [business, jobs, leads] = await Promise.all([
    prisma.business.findUnique({
      where: { id: params.businessId },
      select: { trade: true, servicesJson: true, name: true },
    }),
    prisma.job.findMany({
      where: {
        businessId: params.businessId,
        status: { in: OPEN_JOB },
        OR: [{ id: { in: ids("job") } }, { customerId: { in: customerIds } }],
      },
      include: { customer: { select: { name: true } }, technician: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    }),
    prisma.lead.findMany({
      where: {
        businessId: params.businessId,
        status: "new",
        job: { is: null },
        OR: [{ id: { in: ids("lead") } }, { customerId: { in: customerIds } }],
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
  ]);

  const unassigned = jobs.filter((j) => !j.technicianId);
  const emergencyFirst = [...unassigned].sort(
    (a, b) => Number(b.urgency === "emergency") - Number(a.urgency === "emergency"),
  );
  for (const job of unassigned.slice(0, 2)) {
    matters.push(
      `${job.title}${job.customer?.name ? ` for ${job.customer.name}` : ""} has no technician${
        job.scheduledAt ? ` and is booked for ${when(job.scheduledAt)}` : ""
      }.`,
    );
  }
  for (const lead of leads.slice(0, 2)) {
    matters.push(
      `${lead.name ?? lead.phone ?? "A caller"} asked about ${lead.serviceType ?? "service"} ${ago(lead.createdAt, now)} ago and has not been contacted.`,
    );
  }
  for (const job of jobs.filter((j) => j.technicianId).slice(0, 1)) {
    if (job.scheduledAt && !job.customerConfirmedAt) {
      matters.push(`${job.customer?.name ?? "The customer"} has not confirmed ${when(job.scheduledAt)} yet.`);
    }
  }
  for (const job of jobs) {
    if (!job.address) uncertainty.push(`${job.title} has no service address on file.`);
    if (!job.scheduledAt) uncertainty.push(`${job.title} has no appointment time yet.`);
  }
  for (const lead of leads) {
    if (!lead.phone) uncertainty.push(`${lead.name ?? "One lead"} left no callback number.`);
  }

  let recommendation: AskRecommendation | null = null;
  for (const job of emergencyFirst) {
    if (!job.scheduledAt || !business) continue;
    const playbook = classifyRequest({
      business,
      serviceType: job.serviceType,
      notes: job.notes,
      urgency: job.urgency,
    });
    const ranking = await recommendTechnician({
      businessId: params.businessId,
      scheduledAt: job.scheduledAt,
      durationMin: job.durationMin ?? playbook.service.durationMin,
      skill: playbook.service.skill,
      excludeJobId: job.id,
    });
    if (!ranking.pick) {
      uncertainty.push(`${job.title}: ${ranking.blocked}`);
      continue;
    }
    recommendation = {
      action: "assign_tech",
      label: `Assign ${ranking.pick.name} to ${job.title}`,
      reason: `${ranking.pick.name} ${ranking.pick.reason}.${job.urgency === "emergency" ? " This is an emergency." : ""}`,
      recordType: "job",
      recordId: job.id,
      jobId: job.id,
      technicianId: ranking.pick.technicianId,
    };
    break;
  }

  if (!recommendation) {
    const lead = leads[0];
    if (lead) {
      recommendation = lead.phone
        ? {
            action: "sms_followup",
            label: `Text ${lead.name ?? lead.phone} that you’re on it`,
            reason: `They have waited ${ago(lead.createdAt, now)} with no reply; a text now keeps the job from going to another shop.`,
            recordType: "lead",
            recordId: lead.id,
            leadId: lead.id,
          }
        : {
            action: "mark_contacted",
            label: `Mark ${lead.name ?? "this lead"} as contacted`,
            reason: "There is no number to text, so record that you reached them another way.",
            recordType: "lead",
            recordId: lead.id,
            leadId: lead.id,
          };
    }
  }

  if (!matters.length && !recommendation) {
    matters.push("Nothing in these records is waiting on you — every open job has a technician and every lead has been contacted.");
  }

  return { matters, uncertainty: [...new Set(uncertainty)].slice(0, 4), recommendation };
}
