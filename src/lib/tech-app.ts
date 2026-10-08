import { recordAudit } from "@/lib/audit";
import { COLLECTED_STATUSES } from "@/lib/payment-math";
import { safeTimezone, shopDayBounds, formatShopTime } from "@/lib/availability";
import { firstName } from "@/lib/customer-confirm";
import { sendCustomerSms } from "@/lib/customer-sms";
import { techLinkExpired } from "@/lib/ensure-tech-token";
import { balanceDueForJob, invoiceCompletedJob, invoicePayUrl, sendInvoiceLink, upsertJobInvoice } from "@/lib/invoice-pay";
import { completeJobWithOutcome, updateJobStatus } from "@/lib/job";
import { FieldError, jobField, priceBook } from "@/lib/job-field";
import { isJobOutcomeCode } from "@/lib/job-outcome";
import { logWarn } from "@/lib/logger";
import { formatCentsExact } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { mintPublicToken } from "@/lib/public-tokens";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { getConnectStatus } from "@/lib/stripe-connect";
import { ensureTechAppToken, techAppUrl } from "@/lib/tech-app-link";
import { sendSms } from "@/lib/twilio-sms";

/**
 * A fresh link for a technician, texted to their phone. The old link stops
 * working at once, so a lost phone or a former employee loses access.
 */
export async function issueTechAppLink(params: { businessId: string; technicianId: string; send: boolean; actorEmail: string; actor: "owner" | "teammate" }) {
  const tech = await prisma.technician.findFirst({
    where: { id: params.technicianId, businessId: params.businessId },
    select: { id: true, name: true, phone: true, isActive: true, business: { select: { name: true } } },
  });
  if (!tech) throw new FieldError("Technician not found", 404);
  if (!tech.isActive) throw new FieldError("This technician is inactive.", 409);
  const appToken = mintPublicToken();
  await prisma.technician.update({ where: { id: tech.id }, data: { appToken, appTokenAt: new Date() } });
  const url = techAppUrl(appToken);
  let sent = false;
  let reason: string | null = null;
  if (params.send) {
    if (!tech.phone) reason = "no_phone";
    else {
      const result = await sendSms({
        to: tech.phone,
        businessId: params.businessId,
        audience: "tech",
        body: withSmsOptOutFooter(`${tech.business.name}: here's your Orvius app. Your jobs, directions, photos and payments are all in it. Save this link: ${url}`),
      });
      sent = Boolean(result);
      if (!result) reason = "sms_unavailable";
    }
  }
  await recordAudit({
    businessId: params.businessId,
    entityType: "technician",
    entityId: tech.id,
    action: "technician.app_link",
    actor: params.actor,
    actorEmail: params.actorEmail,
    summary: sent ? `Texted ${tech.name} a new app link` : `Made ${tech.name} a new app link`,
  });
  return { url, sent, reason };
}

export async function revokeTechAppLink(params: { businessId: string; technicianId: string; actorEmail: string; actor: "owner" | "teammate" }) {
  const gone = await prisma.technician.updateMany({ where: { id: params.technicianId, businessId: params.businessId }, data: { appToken: null, appTokenAt: null } });
  if (!gone.count) throw new FieldError("Technician not found", 404);
  await recordAudit({
    businessId: params.businessId,
    entityType: "technician",
    entityId: params.technicianId,
    action: "technician.app_link_revoked",
    actor: params.actor,
    actorEmail: params.actorEmail,
    summary: "Turned off a technician's app link",
  });
}

const BUSINESS_SELECT = {
  id: true,
  name: true,
  timezone: true,
  stripeConnectAccountId: true,
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
} as const;

export async function techForToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.technician.findFirst({
    where: { appToken: token, isActive: true },
    select: { id: true, name: true, phone: true, businessId: true, business: { select: BUSINESS_SELECT } },
  });
}

export type TechSession = NonNullable<Awaited<ReturnType<typeof techForToken>>>;

const JOB_SELECT = {
  id: true,
  title: true,
  status: true,
  scheduledAt: true,
  completedAt: true,
  createdAt: true,
  address: true,
  urgency: true,
  serviceType: true,
  durationMin: true,
  notes: true,
  etaText: true,
  customer: { select: { name: true, phone: true, address: true } },
  lead: { select: { name: true, phone: true } },
} as const;

type JobRow = { customer: { name: string | null; phone: string; address: string | null } | null; lead: { name: string | null; phone: string | null } | null };

function customerOf(job: JobRow) {
  return {
    customerName: job.customer?.name ?? job.lead?.name ?? null,
    customerPhone: job.customer?.phone ?? job.lead?.phone ?? null,
  };
}

function dayKey(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export type TechDayJob = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  durationMin: number | null;
  address: string | null;
  urgency: string | null;
  customerName: string | null;
  customerPhone: string | null;
  hasNotes: boolean;
};

/**
 * What a technician's app opens to: anything they are in the middle of, then
 * their jobs from today through the next two weeks, grouped by the shop's days.
 */
export async function techDay(tech: TechSession, now = new Date()) {
  const tz = safeTimezone(tech.business.timezone ?? "America/New_York");
  const today = shopDayBounds(null, tz, now);
  const horizon = new Date(today.start.getTime() + 14 * 86_400_000);
  const rows = await prisma.job.findMany({
    where: {
      businessId: tech.businessId,
      technicianId: tech.id,
      status: { not: "cancelled" },
      OR: [
        { status: { in: ["en_route", "on_site"] } },
        { scheduledAt: { gte: today.start, lt: horizon } },
        { completedAt: { gte: today.start } },
        { status: { in: ["scheduled", "confirmed"] }, scheduledAt: { gte: new Date(today.start.getTime() - 3 * 86_400_000), lt: today.start } },
      ],
    },
    select: JOB_SELECT,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  const todayKey = today.day;
  const tomorrowKey = dayKey(new Date(today.end.getTime() + 60_000), tz);
  const jobs = rows.map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    scheduledAt: j.scheduledAt?.toISOString() ?? null,
    durationMin: j.durationMin,
    address: j.address ?? j.customer?.address ?? null,
    urgency: j.urgency,
    ...customerOf(j),
    hasNotes: Boolean(j.notes?.trim()),
    key: j.scheduledAt ? dayKey(j.scheduledAt, tz) : todayKey,
  }));
  const now_ = jobs.filter((j) => j.status === "en_route" || j.status === "on_site");
  const late = jobs.filter((j) => (j.status === "scheduled" || j.status === "confirmed") && j.key < todayKey);
  const rest = jobs.filter((j) => !now_.includes(j) && !late.includes(j));
  const groups = new Map<string, TechDayJob[]>();
  for (const { key, ...job } of rest) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(job);
  }
  const label = (key: string) => {
    if (key === todayKey) return "Today";
    if (key === tomorrowKey) return "Tomorrow";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  };
  if (!groups.has(todayKey)) groups.set(todayKey, []);
  const days = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, label: label(key), jobs: list }));
  const strip = ({ key: _key, ...job }: (typeof jobs)[number]) => job;
  return {
    technician: { name: tech.name },
    shop: { name: tech.business.name, timezone: tz },
    now: now_.map(strip),
    late: late.map(strip),
    days,
  };
}

async function techJob(tech: TechSession, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, businessId: tech.businessId, technicianId: tech.id },
    select: { ...JOB_SELECT, resolutionCode: true, resolutionSummary: true, finalAmountCents: true, customerConfirmedAt: true, estimate: { select: { amountCents: true, status: true } } },
  });
  if (!job || techLinkExpired(job)) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
  return job;
}

async function money(tech: TechSession, job: { id: string; finalAmountCents: number | null; estimate: { amountCents: number; status: string } | null }, linesTotal: number, hasLines: boolean) {
  const totalCents = hasLines ? linesTotal : (job.finalAmountCents ?? (job.estimate?.status === "accepted" ? job.estimate.amountCents : null));
  const invoice = await prisma.invoice.findFirst({
    where: { businessId: tech.businessId, jobId: job.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, amountCents: true, publicToken: true, sentAt: true, paidAt: true, payments: { where: { status: { in: COLLECTED_STATUSES } }, select: { amountCents: true, method: true } } },
  });
  const { depositPaidCents, balanceCents } = await balanceDueForJob({ businessId: tech.businessId, jobId: job.id, totalCents: totalCents ?? 0 });
  const paidCents = invoice?.payments.reduce((sum, p) => sum + p.amountCents, 0) ?? 0;
  return {
    totalCents,
    depositPaidCents,
    balanceCents: invoice?.status === "paid" ? 0 : Math.max(0, balanceCents - paidCents),
    cardReady: getConnectStatus(tech.business).canAcceptPayments,
    invoice: invoice
      ? {
          status: invoice.status,
          amountCents: invoice.amountCents,
          sentAt: invoice.sentAt?.toISOString() ?? null,
          paidAt: invoice.paidAt?.toISOString() ?? null,
          paidCents,
          payUrl: invoice.publicToken ? invoicePayUrl(invoice.publicToken) : null,
          method: invoice.payments[0]?.method ?? null,
        }
      : null,
  };
}

/** One job as its technician sees it: the visit, the customer, the work, the photos, the money. */
export async function techJobDetail(tech: TechSession, jobId: string) {
  const job = await techJob(tech, jobId);
  const [field, book] = await Promise.all([jobField(tech.businessId, job.id), priceBook(tech.businessId)]);
  return {
    job: {
      id: job.id,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      durationMin: job.durationMin,
      address: job.address ?? job.customer?.address ?? null,
      urgency: job.urgency,
      serviceType: job.serviceType,
      officeNotes: job.notes,
      etaText: job.etaText,
      customerConfirmed: Boolean(job.customerConfirmedAt) || job.status === "confirmed",
      resolutionCode: job.resolutionCode,
      resolutionSummary: job.resolutionSummary,
      ...customerOf(job),
    },
    shop: { name: tech.business.name, timezone: safeTimezone(tech.business.timezone ?? "America/New_York") },
    technician: { name: tech.name },
    lines: field.lines,
    linesTotalCents: field.totalCents,
    photos: field.photos,
    notes: field.notes,
    priceBook: book,
    money: await money(tech, job, field.totalCents, field.lines.length > 0),
  };
}

async function customerText(jobId: string, businessId: string, body: string, action: string, summary: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { leadId: true, customerId: true, customer: { select: { phone: true } }, lead: { select: { phone: true } } } });
  const to = job?.customer?.phone?.trim() || job?.lead?.phone?.trim();
  if (!job || !to) return { sent: false as const, reason: "no_customer_phone" };
  try {
    const result = await sendCustomerSms({ businessId, to, body: withSmsOptOutFooter(body) });
    if (result.sent) {
      await recordAudit({ businessId, entityType: "job", entityId: jobId, action, actor: "orvius", summary, jobId, leadId: job.leadId, customerId: job.customerId });
    }
    return result;
  } catch (error) {
    logWarn(`${action}_failed`, { jobId, error: error instanceof Error ? error.message : String(error) });
    return { sent: false as const, reason: "send_failed" };
  }
}

const TECH_STATUSES = ["confirmed", "en_route", "on_site", "completed"] as const;

/**
 * A status change from the field. Moving to "arrived" or "done" texts the
 * customer once, however many times the button is tapped.
 */
export async function techUpdateJob(
  tech: TechSession,
  jobId: string,
  body: { status?: unknown; etaText?: unknown; resolutionCode?: unknown; resolutionSummary?: unknown; finalAmountCents?: unknown },
) {
  const job = await techJob(tech, jobId);
  const shop = tech.business.name;
  const who = firstName(tech.name) ?? "Your technician";
  const actor = { actor: "technician" as const, actorEmail: null };

  if (typeof body.etaText === "string") {
    await prisma.job.update({ where: { id: job.id }, data: { etaText: body.etaText.trim().slice(0, 80) || null } });
  }
  const status = typeof body.status === "string" ? body.status : null;
  if (status && !(TECH_STATUSES as readonly string[]).includes(status)) throw new FieldError("Unknown status");
  if (status && status === job.status) return techJobDetail(tech, job.id);
  if (job.status === "completed" && status) throw new FieldError("This job is already done.", 409);

  if (status === "on_site") {
    const moved = await prisma.job.updateMany({ where: { id: job.id, status: { not: "on_site" } }, data: { status: "on_site", onSiteAt: new Date() } });
    if (moved.count) {
      await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: job.id, jobId: job.id, action: "job.status", ...actor, summary: `${tech.name} arrived` });
      await customerText(job.id, tech.businessId, `${shop}: ${who} has arrived for your appointment.`, "customer.arrived_sent", `Texted the customer that ${who} arrived`);
    }
  } else if (status === "completed") {
    if (!isJobOutcomeCode(body.resolutionCode)) throw new FieldError("Choose what happened before finishing the job.");
    const lines = await prisma.jobLineItem.count({ where: { jobId: job.id } });
    const typed = typeof body.finalAmountCents === "number" ? body.finalAmountCents : null;
    await completeJobWithOutcome(job.id, {
      resolutionCode: body.resolutionCode,
      resolutionSummary: typeof body.resolutionSummary === "string" ? body.resolutionSummary : null,
      finalAmountCents: lines ? job.finalAmountCents : typed,
    });
    await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: job.id, jobId: job.id, action: "job.status", ...actor, summary: `${tech.name} finished the job` });
    const billed = await invoiceCompletedJob(job.id).catch((error) => {
      logWarn("invoice.on_complete_failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
    const invoiceTexted = Boolean(billed && "sms" in billed && billed.sms?.sent);
    const alreadyPaid = billed && "invoice" in billed && billed.invoice?.status === "paid";
    if (!invoiceTexted) {
      await customerText(
        job.id,
        tech.businessId,
        `${shop}: ${who} has finished the job.${alreadyPaid ? " You're all paid up." : ""} Thanks for choosing us.`,
        "customer.job_done_sent",
        "Texted the customer that the job is finished",
      );
    }
  } else if (status) {
    await updateJobStatus(job.id, status as "confirmed" | "en_route");
    await recordAudit({
      businessId: tech.businessId,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      action: "job.status",
      ...actor,
      summary: status === "en_route" ? `${tech.name} is on the way` : `${tech.name} confirmed the job`,
    });
  }
  return techJobDetail(tech, job.id);
}

/**
 * Get paid before leaving: text the customer the pay link, open it on this
 * phone for them to pay by card, or record cash or a check.
 */
export async function techCollect(tech: TechSession, jobId: string, method: unknown) {
  const job = await techJob(tech, jobId);
  const detail = await techJobDetail(tech, job.id);
  const total = detail.money.totalCents;
  if (!total) throw new FieldError("Add what you did first, so there's a total to collect.");
  if (detail.money.invoice?.status === "paid") throw new FieldError("This job is already paid.", 409);
  if (method === "text" || method === "here") {
    if (!detail.money.cardReady) throw new FieldError("Card payments aren't set up for this shop yet. Collect cash or a check, or ask the office.", 409);
  } else if (method !== "cash" && method !== "check") {
    throw new FieldError("Pick how they're paying.");
  }
  const { invoice } = await upsertJobInvoice({ businessId: tech.businessId, jobId: job.id, totalCents: total });
  if (method === "text") {
    const phone = detail.job.customerPhone;
    if (!phone) throw new FieldError("There's no customer phone on this job.", 409);
    const sms = await sendInvoiceLink({ business: tech.business, invoice, toPhone: phone });
    if (!sms.sent) throw new FieldError("The text didn't go through. Open the pay page on your phone instead.", 502);
    await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: job.id, jobId: job.id, action: "invoice.sent", actor: "technician", summary: `${tech.name} texted the ${formatCentsExact(invoice.amountCents)} pay link` });
  } else if (method === "cash" || method === "check") {
    const paid = await prisma.payment.aggregate({ where: { invoiceId: invoice.id, status: { in: COLLECTED_STATUSES } }, _sum: { amountCents: true } });
    const owed = Math.max(0, invoice.amountCents - (paid._sum.amountCents ?? 0));
    await prisma.$transaction([
      prisma.payment.updateMany({ where: { invoiceId: invoice.id, status: "claimed" }, data: { status: "superseded" } }),
      ...(owed > 0 ? [prisma.payment.create({ data: { businessId: tech.businessId, invoiceId: invoice.id, amountCents: owed, status: "recorded", method } })] : []),
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: "paid", paidAt: new Date() } }),
    ]);
    await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: job.id, jobId: job.id, action: "payment.recorded", actor: "technician", summary: `${tech.name} collected ${formatCentsExact(owed)} by ${method}` });
  }
  return techJobDetail(tech, job.id);
}

export type TechChange = "moved" | "cancelled" | "removed";

/** Tell a technician that a job of theirs changed, with a link straight to it. Never throws. */
export async function notifyTechJobChanged(params: { jobId: string; technicianId: string; change: TechChange }) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
      select: { id: true, title: true, scheduledAt: true, businessId: true, business: { select: { name: true, timezone: true } }, customer: { select: { name: true } }, lead: { select: { name: true } } },
    });
    const tech = await prisma.technician.findUnique({ where: { id: params.technicianId }, select: { id: true, name: true, phone: true, isActive: true } });
    if (!job || !tech?.phone || !tech.isActive) return { sent: false, reason: "no_phone" };
    const who = job.customer?.name ?? job.lead?.name;
    const what = `${job.title}${who ? ` for ${who}` : ""}`;
    const when = job.scheduledAt ? formatShopTime(job.scheduledAt, job.business.timezone ?? "America/New_York") : "no time set yet";
    const token = await ensureTechAppToken(tech.id);
    const line =
      params.change === "moved"
        ? `job moved: ${what} is now ${when}.\nOpen: ${techAppUrl(token, job.id)}`
        : params.change === "cancelled"
          ? `job cancelled: ${what} (${when}) is off your schedule.\nYour day: ${techAppUrl(token)}`
          : `you're off a job: ${what} (${when}) went to someone else.\nYour day: ${techAppUrl(token)}`;
    const result = await sendSms({ to: tech.phone, businessId: job.businessId, audience: "tech", jobId: job.id, body: withSmsOptOutFooter(`${job.business.name}: ${line}`) });
    return { sent: Boolean(result), reason: result ? undefined : "sms_unavailable" };
  } catch (error) {
    logWarn("tech.change_notify_failed", { jobId: params.jobId, error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "error" };
  }
}

export { ensureTechAppToken, techAppUrl };
