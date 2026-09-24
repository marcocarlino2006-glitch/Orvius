import type { Prisma } from "@prisma/client";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { MemoryHit } from "@/lib/shop-memory";

const OPEN = new Set(["scheduled", "confirmed", "en_route", "on_site"]);

function when(date: Date, timeZone: string, withDay = true) {
  return date.toLocaleString("en-US", {
    ...(withDay ? { weekday: "short", month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function day(date: Date, timeZone: string) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

function sinceText(date: Date, now: number) {
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

async function paidCents(businessId: string, job: Prisma.JobWhereInput) {
  const sum = await prisma.payment.aggregate({
    where: {
      businessId,
      status: { notIn: ["failed", "refunded"] },
      invoice: { OR: [{ job }, { estimate: { job } }] },
    },
    _sum: { amountCents: true },
  });
  return sum._sum?.amountCents ?? 0;
}

const street = (address: string | null) => address?.split(",")[0]?.trim() || null;

/**
 * One or two sentences that answer the question from the best-matching record,
 * written the way a dispatcher would say it. The cited records carry the detail;
 * this must never repeat them as a list.
 */
export async function answerFromRecords(params: {
  businessId: string;
  hits: MemoryHit[];
  now?: number;
}): Promise<string | null> {
  const now = params.now ?? Date.now();
  const top = params.hits.find((h) => h.type !== "operate");
  if (!top) return null;
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { timezone: true },
  });
  const tz = business?.timezone || "America/New_York";
  const tenant = { id: top.id, businessId: params.businessId };
  const others = params.hits.filter((h) => h.type !== "operate").length - 1;
  const more = others > 0 ? ` ${others} related record${others === 1 ? "" : "s"} below.` : "";

  if (top.type === "job") {
    const job = await prisma.job.findFirst({
      where: tenant,
      include: {
        customer: { select: { name: true } },
        technician: { select: { name: true } },
      },
    });
    if (!job) return null;
    const who = job.customer?.name ? ` for ${job.customer.name}` : "";
    const where = street(job.address) ? ` at ${street(job.address)}` : "";
    if (job.status === "completed") {
      const paid = await paidCents(params.businessId, { id: job.id });
      const money = paid
        ? `, paid ${formatCents(paid)}`
        : job.finalAmountCents
          ? `, ${formatCents(job.finalAmountCents)} still to collect`
          : ", with no amount recorded yet";
      const doneAt = job.completedAt ?? job.scheduledAt;
      return `${job.title}${who} was completed${doneAt ? ` ${day(doneAt, tz)}` : ""}${job.technician ? ` by ${job.technician.name}` : ""}${money}.${more}`;
    }
    if (job.status === "cancelled") return `${job.title}${who} was cancelled.${more}`;
    const time = job.scheduledAt ? ` ${when(job.scheduledAt, tz)}` : " with no time set";
    const owner = job.technician ? `${job.technician.name} has it` : "No technician is assigned yet";
    const overdue =
      job.scheduledAt && job.scheduledAt.getTime() < now && OPEN.has(job.status) && job.status !== "on_site"
        ? " The appointment time has passed and nobody has marked it started."
        : "";
    return `${job.title}${who} is booked${time}${where}. ${owner}.${overdue}${more}`;
  }

  if (top.type === "customer") {
    const customer = await prisma.customer.findFirst({
      where: tenant,
      include: {
        jobs: {
          orderBy: { scheduledAt: "desc" },
          take: 20,
          select: { title: true, status: true, scheduledAt: true, completedAt: true },
        },
      },
    });
    if (!customer) return null;
    const name = customer.name ?? customer.phone;
    const paid = await paidCents(params.businessId, { customerId: customer.id });
    const upcoming = customer.jobs
      .filter((j) => OPEN.has(j.status) && j.scheduledAt)
      .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
    const last = customer.jobs.find((j) => j.status === "completed");
    const parts: string[] = [];
    if (!customer.jobs.length) {
      parts.push(`${name} has called but has no job on file yet — last contact ${sinceText(customer.lastSeenAt, now)}.`);
    } else {
      const lifetime = paid ? `, ${formatCents(paid)} paid so far` : "";
      parts.push(`${name} has ${customer.jobs.length} job${customer.jobs.length === 1 ? "" : "s"} on file${lifetime}.`);
      if (upcoming) parts.push(`Next: ${upcoming.title}, ${when(upcoming.scheduledAt!, tz)}.`);
      if (last) parts.push(`Last completed: ${last.title}${last.completedAt ? ` on ${day(last.completedAt, tz)}` : ""}.`);
    }
    return `${parts.join(" ")}${more}`;
  }

  if (top.type === "lead") {
    const lead = await prisma.lead.findFirst({
      where: tenant,
      include: { job: { select: { title: true, scheduledAt: true } } },
    });
    if (!lead) return null;
    const name = lead.name ?? lead.phone ?? "A caller";
    const asked = `${name} asked about ${lead.serviceType?.toLowerCase() ?? "service"} ${sinceText(lead.createdAt, now)}`;
    if (lead.job) {
      return `${asked} and is booked: ${lead.job.title}${lead.job.scheduledAt ? `, ${when(lead.job.scheduledAt, tz)}` : ""}.${more}`;
    }
    const state =
      lead.status === "new"
        ? " and nobody has replied yet"
        : lead.status === "contacted"
          ? " — you've been in touch, but nothing is booked"
          : ` — marked ${lead.status}`;
    return `${asked}${state}.${more}`;
  }

  if (top.type === "call") {
    const call = await prisma.call.findFirst({ where: tenant, select: { callerPhone: true, summary: true, createdAt: true } });
    if (!call) return null;
    const about = call.summary ? `: ${call.summary.replace(/\.$/, "")}` : "";
    return `Call from ${call.callerPhone ?? "an unknown number"} ${sinceText(call.createdAt, now)}${about}.${more}`;
  }

  return null;
}
