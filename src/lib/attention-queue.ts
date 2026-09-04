import { isPriorityUrgency } from "@/lib/auto-job";
import { listCrew } from "@/lib/field";
import { prisma } from "@/lib/prisma";

export type AttentionKind =
  | "urgent_lead"
  | "new_lead"
  | "overdue_followup"
  | "unassigned_job"
  | "appointment_at_risk"
  | "available_tech"
  | "missing_baseline"
  | "stale_weekly_proof"
  | "billing_action"
  | "founder_cert"
  | "open_invoice"
  | "open_estimate";

export type AttentionImpact = "critical" | "high" | "med";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  rank: number;
  impact: AttentionImpact;
  title: string;
  detail: string;
  recommendedAction: string;
  href: string;
  entityType: "lead" | "job" | "technician" | "shop";
  entityId: string;
  createdAt: string;
  estimatedRevenueCents?: number | null;
  meta?: {
    urgency?: string | null;
    address?: string | null;
    scheduledAt?: string | null;
    phone?: string | null;
  };
};

const FOLLOWUP_HOURS = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function kindRank(kind: AttentionKind, urgency?: string | null): number {
  const emergency = isPriorityUrgency(urgency);
  switch (kind) {
    case "billing_action":
      return 5;
    case "founder_cert":
      return 8;
    case "open_invoice":
      return 12;
    case "open_estimate":
      return 14;
    case "urgent_lead":
      return emergency ? 10 : 20;
    case "missing_baseline":
      return 15;
    case "stale_weekly_proof":
      return 18;
    case "appointment_at_risk":
      return 30;
    case "unassigned_job":
      return emergency ? 35 : 40;
    case "overdue_followup":
      return 50;
    case "new_lead":
      return 60;
    case "available_tech":
      return 90;
  }
}

/**
 * Ranked command-center queue from existing shop data.
 * No invented revenue — impact is operational urgency.
 */
export async function getAttentionQueue(
  businessId: string,
  limit = 12,
): Promise<AttentionItem[]> {
  const now = new Date();
  const followupCutoff = new Date(now.getTime() - FOLLOWUP_HOURS * 60 * 60 * 1000);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [newLeads, activeJobs, crew, business] = await Promise.all([
    prisma.lead.findMany({
      where: { businessId, status: "new" },
      take: 40,
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, technicianId: true, status: true, scheduledAt: true } },
      },
    }),
    prisma.job.findMany({
      where: {
        businessId,
        status: { in: ["scheduled", "confirmed", "en_route", "on_site"] },
      },
      take: 60,
      orderBy: { scheduledAt: "asc" },
      include: {
        customer: { select: { name: true, phone: true } },
        lead: { select: { name: true, phone: true, urgency: true } },
        technician: { select: { id: true, name: true } },
      },
    }),
    listCrew(businessId),
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        avgTicketCents: true,
        baselineMissedCallsPerWeek: true,
        baselineJobsPerWeek: true,
        lastWeeklyProofAt: true,
        founderCertJson: true,
        billingStatus: true,
        pilotEndsAt: true,
        createdAt: true,
      },
    }),
  ]);

  const ticket = business?.avgTicketCents ?? null;

  const items: AttentionItem[] = [];

  const status = (business?.billingStatus ?? "none").toLowerCase();
  if (status === "past_due" || status === "canceled") {
    items.push({
      id: `billing_action:${businessId}`,
      kind: "billing_action",
      rank: kindRank("billing_action"),
      impact: "critical",
      title: status === "past_due" ? "Payment failed" : "Subscription canceled",
      detail: "Shop access depends on an active plan.",
      recommendedAction: "Open billing",
      href: "/dashboard/billing",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  } else if (status === "pilot" || status === "none") {
    const ends = business?.pilotEndsAt
      ? new Date(business.pilotEndsAt)
      : business?.createdAt
        ? new Date(new Date(business.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;
    const daysLeft =
      ends != null
        ? Math.ceil((ends.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;
    if (daysLeft != null && daysLeft <= 7) {
      items.push({
        id: `billing_action:${businessId}`,
        kind: "billing_action",
        rank: kindRank("billing_action"),
        impact: "critical",
        title:
          daysLeft <= 0
            ? "Pilot ended — subscribe"
            : `Pilot ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        detail: "Subscribe so missed calls keep becoming booked jobs.",
        recommendedAction: "Choose a plan",
        href: "/dashboard/billing",
        entityType: "shop",
        entityId: businessId,
        createdAt: now.toISOString(),
      });
    }
  }

  let certDone = 0;
  try {
    const parsed = business?.founderCertJson
      ? (JSON.parse(business.founderCertJson) as boolean[])
      : [];
    if (Array.isArray(parsed)) certDone = parsed.filter(Boolean).length;
  } catch {
    certDone = 0;
  }
  if (certDone < 5) {
    items.push({
      id: `founder_cert:${businessId}`,
      kind: "founder_cert",
      rank: kindRank("founder_cert"),
      impact: "critical",
      title: `Phone cert ${certDone}/5`,
      detail: "Finish real-cell scenarios before high-volume outreach.",
      recommendedAction: "Open certification",
      href: "/dashboard/settings#founder-cert",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const baselineReady =
    ticket != null &&
    ticket > 0 &&
    business?.baselineMissedCallsPerWeek != null &&
    business?.baselineJobsPerWeek != null;
  if (!baselineReady) {
    items.push({
      id: `missing_baseline:${businessId}`,
      kind: "missing_baseline",
      rank: kindRank("missing_baseline"),
      impact: "high",
      title: "Baseline economics missing",
      detail: "Set avg ticket + before-Orvius weekly numbers for honest recovered $.",
      recommendedAction: "Set baseline",
      href: "/dashboard/settings#economics-baseline",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const proofAt = business?.lastWeeklyProofAt
    ? new Date(business.lastWeeklyProofAt)
    : null;
  const proofStale =
    !proofAt ||
    Number.isNaN(proofAt.getTime()) ||
    now.getTime() - proofAt.getTime() > WEEK_MS;
  if (proofStale) {
    items.push({
      id: `stale_weekly_proof:${businessId}`,
      kind: "stale_weekly_proof",
      rank: kindRank("stale_weekly_proof"),
      impact: "high",
      title: "Weekly proof due",
      detail: proofAt
        ? "Last proof is older than 7 days — copy a fresh artifact."
        : "No weekly proof copied yet — multi-b requires measured money.",
      recommendedAction: "Copy weekly proof",
      href: "/dashboard#shop-economics",
      entityType: "shop",
      entityId: businessId,
      createdAt: now.toISOString(),
    });
  }

  const openMoney = await Promise.all([
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["sent", "open", "overdue", "draft"] },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, amountCents: true, status: true, jobId: true, createdAt: true },
    }),
    prisma.estimate.findMany({
      where: {
        businessId,
        status: { in: ["draft", "sent", "accepted"] },
        invoice: null,
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        status: true,
        jobId: true,
        createdAt: true,
      },
    }),
  ]);

  for (const invoice of openMoney[0]) {
    if (invoice.status === "paid" || invoice.status === "void") continue;
    items.push({
      id: `open_invoice:${invoice.id}`,
      kind: "open_invoice",
      rank: kindRank("open_invoice"),
      impact: "high",
      title: `Open invoice · $${Math.round(invoice.amountCents / 100)}`,
      detail: `Status ${invoice.status} — close money in the CRM.`,
      recommendedAction: "Review job",
      href: invoice.jobId ? `/dashboard/jobs/${invoice.jobId}` : "/dashboard#shop-economics",
      entityType: "shop",
      entityId: businessId,
      createdAt: invoice.createdAt.toISOString(),
      estimatedRevenueCents: invoice.amountCents,
    });
  }

  for (const estimate of openMoney[1]) {
    items.push({
      id: `open_estimate:${estimate.id}`,
      kind: "open_estimate",
      rank: kindRank("open_estimate"),
      impact: "med",
      title: `Open estimate · $${Math.round(estimate.amountCents / 100)}`,
      detail: `Status ${estimate.status} — convert or close.`,
      recommendedAction: "Review job",
      href: estimate.jobId
        ? `/dashboard/jobs/${estimate.jobId}`
        : "/dashboard#shop-economics",
      entityType: "shop",
      entityId: businessId,
      createdAt: estimate.createdAt.toISOString(),
      estimatedRevenueCents: estimate.amountCents,
    });
  }

  for (const lead of newLeads) {
    const urgent = isPriorityUrgency(lead.urgency);
    const overdue = lead.createdAt < followupCutoff;
    const kind: AttentionKind = urgent
      ? "urgent_lead"
      : overdue
        ? "overdue_followup"
        : "new_lead";
    const who = lead.name ?? lead.phone ?? "Unknown caller";
    const ageHrs = Math.max(
      1,
      Math.round((now.getTime() - lead.createdAt.getTime()) / 3_600_000),
    );

    items.push({
      id: `${kind}:${lead.id}`,
      kind,
      rank: kindRank(kind, lead.urgency) + Math.min(ageHrs, 20),
      impact: urgent ? "critical" : overdue ? "high" : "med",
      title: who,
      detail: [
        urgent ? "Emergency / same-day" : overdue ? `Unworked ${ageHrs}h` : "New lead",
        lead.serviceType,
        lead.address,
      ]
        .filter(Boolean)
        .join(" · "),
      recommendedAction: lead.job
        ? "Open lead"
        : urgent
          ? "Call back & book"
          : "Follow up",
      href: `/dashboard/inbox/${lead.id}`,
      entityType: "lead",
      entityId: lead.id,
      createdAt: lead.createdAt.toISOString(),
      estimatedRevenueCents: ticket,
      meta: {
        urgency: lead.urgency,
        address: lead.address,
        phone: lead.phone,
        scheduledAt: lead.job?.scheduledAt?.toISOString() ?? null,
      },
    });
  }

  for (const job of activeJobs) {
    const who =
      job.customer?.name ??
      job.lead?.name ??
      job.customer?.phone ??
      job.title;
    const urgency = job.urgency ?? job.lead?.urgency;
    const scheduled = job.scheduledAt;
    const pastDue =
      scheduled != null &&
      scheduled < now &&
      (job.status === "scheduled" || job.status === "confirmed");
    const dueToday =
      scheduled != null && scheduled >= dayStart && scheduled < dayEnd;
    const unassigned = !job.technicianId;

    if (unassigned) {
      items.push({
        id: `unassigned_job:${job.id}`,
        kind: "unassigned_job",
        rank: kindRank("unassigned_job", urgency) + (dueToday ? 0 : 5),
        impact: isPriorityUrgency(urgency) || dueToday ? "critical" : "high",
        title: who,
        detail: [
          "Needs a tech",
          job.title,
          scheduled
            ? scheduled.toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Assign technician",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        meta: {
          urgency,
          address: job.address,
          phone: job.customer?.phone ?? job.lead?.phone,
          scheduledAt: scheduled?.toISOString() ?? null,
        },
      });
    } else if (pastDue) {
      items.push({
        id: `appointment_at_risk:${job.id}`,
        kind: "appointment_at_risk",
        rank: kindRank("appointment_at_risk", urgency),
        impact: "critical",
        title: who,
        detail: [
          "Appointment past due",
          job.technician?.name ? `Tech: ${job.technician.name}` : null,
          job.status.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" · "),
        recommendedAction: "Update status",
        href: `/dashboard/jobs/${job.id}`,
        entityType: "job",
        entityId: job.id,
        createdAt: job.createdAt.toISOString(),
        estimatedRevenueCents: ticket,
        meta: {
          urgency,
          address: job.address,
          scheduledAt: scheduled?.toISOString() ?? null,
        },
      });
    }
  }

  const busyTechIds = new Set(
    activeJobs
      .filter((j) => j.technicianId && j.status !== "completed")
      .map((j) => j.technicianId as string),
  );

  for (const tech of crew) {
    if (!tech.isActive) continue;
    if (busyTechIds.has(tech.id)) continue;
    items.push({
      id: `available_tech:${tech.id}`,
      kind: "available_tech",
      rank: kindRank("available_tech"),
      impact: "med",
      title: tech.name,
      detail: tech.phone
        ? `Available · ${tech.phone}`
        : "Available — add mobile for SMS assign",
      recommendedAction: "Open dispatch",
      href: "/dashboard/dispatch",
      entityType: "technician",
      entityId: tech.id,
      createdAt: now.toISOString(),
      meta: { phone: tech.phone },
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

export function attentionKindLabel(kind: AttentionKind): string {
  switch (kind) {
    case "urgent_lead":
      return "Urgent";
    case "new_lead":
      return "New lead";
    case "overdue_followup":
      return "Follow up";
    case "unassigned_job":
      return "Unassigned";
    case "appointment_at_risk":
      return "At risk";
    case "available_tech":
      return "Crew free";
    case "missing_baseline":
      return "Baseline";
    case "stale_weekly_proof":
      return "Proof";
    case "billing_action":
      return "Billing";
    case "founder_cert":
      return "Cert";
    case "open_invoice":
      return "Invoice";
    case "open_estimate":
      return "Estimate";
  }
}
