import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { recordAudit, type AuditActor } from "@/lib/audit";
import { isMoneySchemaDrift } from "@/lib/command-degraded";
import { logWarn } from "@/lib/logger";
import { formatCentsExact } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Durable invoice creation for a completed job.
 *
 * The job is marked done first. The invoice is a second write, and the pay
 * text is a third, to a provider. None of those can share a transaction.
 * This row is written before the invoice insert. A throw, a dead process, or
 * a repeated "mark done" reads it and finishes the same bill. It never sends
 * a pay text and never changes a bill the customer was already given.
 *
 * The hot path is the completion itself and the desk's "Open the bill"
 * button. The daily notifications cron is the backstop: this project's Vercel
 * scope rejects any schedule besides that one daily run, so a tighter cron
 * is not available. See the comment on /api/cron/notifications.
 */

export const BILLING_LEASE_MS = 2 * 60 * 1000;

const VOIDED = "The bill was voided and was not reopened.";
const REFUNDED = "The bill was refunded and was not reopened.";

export type SettleResult =
  | { outcome: "skipped"; reason: "not_found" | "not_completed" }
  | { outcome: "not_required"; amountCents: number }
  | { outcome: "pending"; reason: "leased" }
  | { outcome: "succeeded"; invoiceId: string; amountCents: number; created: boolean }
  | { outcome: "failed"; error: string; reason: "voided" | "refunded" | "create_failed" };

type CreateInvoice = (params: {
  businessId: string;
  jobId: string;
  totalCents: number;
}) => Promise<{ invoice: { id: string; amountCents: number } }>;

export type SettleOptions = {
  /** When set, a job from another shop is refused and nothing is written. */
  businessId?: string;
  createInvoice?: CreateInvoice;
  now?: Date;
};

type LiveInvoice = {
  id: string;
  amountCents: number;
  status: string;
  sentAt: Date | null;
  estimateId: string | null;
  payments: { id: string }[];
};

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

function schemaMissing(error: unknown) {
  if (isMoneySchemaDrift(error)) return true;
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: string }).code === "P2021") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** A bill the customer was sent, signed, or paid toward. A retry must not price it again. */
function committed(invoice: LiveInvoice) {
  return Boolean(invoice.sentAt || invoice.estimateId || invoice.payments.length || invoice.status === "paid" || invoice.status === "partial");
}

async function defaultCreate(params: { businessId: string; jobId: string; totalCents: number }) {
  const { upsertJobInvoice } = await import("@/lib/invoice-pay");
  const result = await upsertJobInvoice(params);
  return { invoice: { id: result.invoice.id, amountCents: result.invoice.amountCents } };
}

async function loadJob(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      status: true,
      finalAmountCents: true,
      estimate: { select: { amountCents: true, status: true } },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amountCents: true, status: true, sentAt: true, estimateId: true, payments: { select: { id: true } } },
      },
    },
  });
}

function obligationCents(job: { finalAmountCents: number | null; estimate: { amountCents: number; status: string } | null }) {
  if (job.finalAmountCents != null) return job.finalAmountCents;
  if (job.estimate?.status === "accepted") return job.estimate.amountCents;
  return null;
}

async function remember(job: { id: string; businessId: string }, amountCents: number, status: "required" | "not_required") {
  try {
    return await prisma.jobBilling.upsert({
      where: { jobId: job.id },
      create: { businessId: job.businessId, jobId: job.id, status, amountCents },
      update: status === "not_required" ? { status, amountCents, claimedAt: null, claimToken: null, lastError: null } : { amountCents },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    return prisma.jobBilling.findUniqueOrThrow({ where: { jobId: job.id } });
  }
}

async function markSucceeded(jobId: string, invoiceId: string, amountCents: number, claimToken?: string) {
  await prisma.jobBilling.updateMany({
    where: claimToken ? { jobId, claimToken } : { jobId },
    data: { status: "succeeded", invoiceId, amountCents, claimedAt: null, claimToken: null, lastError: null },
  });
}

/**
 * Open the one invoice for a completed job, or record why it could not be
 * opened. Safe to call again: a live invoice is linked, a voided or refunded
 * one is left as it is, and a fresh lease is not stolen.
 */
export async function settleJobBilling(jobId: string, options: SettleOptions = {}): Promise<SettleResult> {
  const job = await loadJob(jobId);
  if (!job || (options.businessId && job.businessId !== options.businessId)) return { outcome: "skipped", reason: "not_found" };
  if (job.status !== "completed") return { outcome: "skipped", reason: "not_completed" };

  const amount = obligationCents(job);
  const create = options.createInvoice ?? defaultCreate;
  const live = job.invoices.find((invoice) => invoice.status !== "void" && invoice.status !== "refunded") ?? null;
  const closed = job.invoices.find((invoice) => invoice.status === "void" || invoice.status === "refunded") ?? null;

  let row: { status: string; lastError: string | null } | null = null;
  try {
    if (amount == null || amount <= 0) {
      await remember(job, amount ?? 0, "not_required");
      return { outcome: "not_required", amountCents: amount ?? 0 };
    }
    row = await remember(job, amount, "required");
  } catch (error) {
    if (!schemaMissing(error)) throw error;
    /* The obligation table is not on this database yet. Still open the bill once; the row appears after the migration. */
    if (live || closed) return live ? { outcome: "succeeded", invoiceId: live.id, amountCents: amount ?? live.amountCents, created: false } : { outcome: "failed", error: closed?.status === "void" ? VOIDED : REFUNDED, reason: closed?.status === "void" ? "voided" : "refunded" };
    if (amount == null || amount <= 0) return { outcome: "not_required", amountCents: amount ?? 0 };
    try {
      const created = await create({ businessId: job.businessId, jobId: job.id, totalCents: amount });
      return { outcome: "succeeded", invoiceId: created.invoice.id, amountCents: amount, created: true };
    } catch (createError) {
      return { outcome: "failed", error: errorText(createError), reason: "create_failed" };
    }
  }

  if (!live && closed) {
    const error = closed.status === "void" ? VOIDED : REFUNDED;
    if (row.status !== "failed" || row.lastError !== error) {
      await prisma.jobBilling.update({ where: { jobId: job.id }, data: { status: "failed", lastError: error, claimedAt: null, claimToken: null } });
    }
    return { outcome: "failed", error, reason: closed.status === "void" ? "voided" : "refunded" };
  }

  if (live) {
    const priced = !committed(live) && row.status !== "succeeded";
    const held = committed(live) && row.status !== "succeeded";
    if (priced || held) {
      try {
        await create({ businessId: job.businessId, jobId: job.id, totalCents: amount! });
      } catch (error) {
        const still = await prisma.invoice.findFirst({ where: { id: live.id, businessId: job.businessId }, select: { id: true } });
        if (!still) return recordFailure(job.id, error);
        /* The bill is already there. A pricing throw must not pretend the create never happened. */
      }
    }
    const current = await prisma.invoice.findFirst({ where: { id: live.id, businessId: job.businessId }, select: { id: true, amountCents: true } });
    if (!current) return recordFailure(job.id, new Error("The invoice disappeared before it could be linked."));
    await markSucceeded(job.id, current.id, amount!);
    return { outcome: "succeeded", invoiceId: current.id, amountCents: amount!, created: false };
  }

  const now = options.now ?? new Date();
  const token = randomBytes(8).toString("hex");
  const cutoff = new Date(now.getTime() - BILLING_LEASE_MS);
  const taken = await prisma.jobBilling.updateMany({
    where: {
      jobId: job.id,
      OR: [
        { status: { in: ["required", "failed", "not_required"] } },
        { status: "pending", OR: [{ claimedAt: null }, { claimedAt: { lt: cutoff } }] },
        { status: "succeeded" },
      ],
    },
    data: { status: "pending", claimedAt: now, claimToken: token, attempts: { increment: 1 }, attemptedAt: now, lastError: null, invoiceId: null },
  });
  if (!taken.count) return { outcome: "pending", reason: "leased" };

  try {
    const created = await create({ businessId: job.businessId, jobId: job.id, totalCents: amount! });
    await markSucceeded(job.id, created.invoice.id, amount!, token);
    return { outcome: "succeeded", invoiceId: created.invoice.id, amountCents: amount!, created: true };
  } catch (error) {
    const raced = await prisma.invoice.findFirst({
      where: { businessId: job.businessId, jobId: job.id, status: { notIn: ["void", "refunded"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (raced) {
      await markSucceeded(job.id, raced.id, amount!, token);
      return { outcome: "succeeded", invoiceId: raced.id, amountCents: amount!, created: false };
    }
    return recordFailure(job.id, error, token);
  }
}

async function recordFailure(jobId: string, error: unknown, claimToken?: string): Promise<SettleResult> {
  const message = errorText(error);
  logWarn("job.billing_failed", { jobId, error: message });
  await prisma.jobBilling.updateMany({
    where: claimToken ? { jobId, claimToken } : { jobId },
    data: { status: "failed", lastError: message, claimedAt: null, claimToken: null },
  });
  return { outcome: "failed", error: message, reason: "create_failed" };
}

/** The pay text is its own fact. A failure here must not turn a created invoice back into a failed create. */
export async function recordBillingNotification(jobId: string, input: { status: "not_sent" | "sent" | "failed"; error?: string | null }) {
  await prisma.jobBilling
    .updateMany({
      where: { jobId },
      data: {
        notifyStatus: input.status,
        notifyError: input.status === "failed" ? (input.error ?? "The bill was not sent.").slice(0, 300) : null,
        notifyAttemptedAt: input.status === "not_sent" ? null : new Date(),
      },
    })
    .catch((error) => logWarn("job.billing_notify_unrecorded", { jobId, error: errorText(error) }));
}

export type BillingExceptionKind = "creation" | "notification" | "collection" | "inconsistent";

export type BillingException = {
  kind: BillingExceptionKind;
  jobId: string | null;
  customer: string | null;
  phone: string | null;
  leadId: string | null;
  completedAt: string | null;
  amountCents: number | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  sentAt: string | null;
  notifyStatus: string | null;
  billingStatus: string | null;
  attempts: number;
  lastError: string | null;
  attemptedAt: string | null;
};

const personSelect = { name: true, phone: true } as const;

function person(job: { customer: { name: string | null; phone: string | null } | null; lead: { name: string | null; phone: string | null } | null } | null) {
  return {
    customer: job?.customer?.name ?? job?.lead?.name ?? null,
    phone: job?.customer?.phone ?? job?.lead?.phone ?? null,
  };
}

/**
 * Shop-scoped differences a person can see: work done with no invoice, a
 * create that failed, an open bill nobody was texted, a sent bill nobody has
 * paid, and records that disagree. Reads only. It does not charge, text, or reprice.
 */
export async function listBillingExceptions(businessId: string, options: { since?: Date; limit?: number } = {}): Promise<BillingException[]> {
  const since = options.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const take = options.limit ?? 20;
  const live = { notIn: ["void", "refunded"] };
  const [unbilled, unsent, unpaid, noCharge, paidEarly, orphanSucceeded] = await Promise.all([
    prisma.job.findMany({
      where: { businessId, status: "completed", completedAt: { gte: since }, finalAmountCents: { gt: 0 }, invoices: { none: { status: live } } },
      orderBy: { completedAt: "desc" },
      take,
      select: {
        id: true,
        leadId: true,
        finalAmountCents: true,
        completedAt: true,
        customer: { select: personSelect },
        lead: { select: personSelect },
        billing: { select: { status: true, attempts: true, lastError: true, attemptedAt: true, notifyStatus: true } },
        invoices: { where: { status: { in: ["void", "refunded"] } }, select: { id: true, status: true }, take: 1 },
      },
    }),
    prisma.invoice.findMany({
      where: { businessId, sentAt: null, paidAt: null, amountCents: { gt: 0 }, status: live, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        amountCents: true,
        status: true,
        sentAt: true,
        jobId: true,
        job: { select: { id: true, leadId: true, completedAt: true, customer: { select: personSelect }, lead: { select: personSelect }, billing: { select: { notifyStatus: true, notifyError: true, notifyAttemptedAt: true, attempts: true, status: true } } } },
      },
    }),
    prisma.invoice.findMany({
      where: { businessId, sentAt: { not: null }, paidAt: null, amountCents: { gt: 0 }, status: { notIn: ["paid", "void", "refunded"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        amountCents: true,
        status: true,
        sentAt: true,
        jobId: true,
        job: { select: { id: true, leadId: true, completedAt: true, customer: { select: personSelect }, lead: { select: personSelect }, billing: { select: { notifyStatus: true, attempts: true, status: true, lastError: true, attemptedAt: true } } } },
      },
    }),
    prisma.job.findMany({
      where: { businessId, status: "completed", finalAmountCents: { lte: 0 }, invoices: { some: { status: live, amountCents: { gt: 0 } } } },
      orderBy: { completedAt: "desc" },
      take,
      select: {
        id: true,
        leadId: true,
        finalAmountCents: true,
        completedAt: true,
        customer: { select: personSelect },
        lead: { select: personSelect },
        billing: { select: { status: true, attempts: true, lastError: true, attemptedAt: true, notifyStatus: true } },
        invoices: { where: { status: live, amountCents: { gt: 0 } }, select: { id: true, status: true, amountCents: true, sentAt: true }, take: 1 },
      },
    }),
    prisma.invoice.findMany({
      where: { businessId, status: { in: ["paid", "partial"] }, job: { status: { not: "completed" } } },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, amountCents: true, status: true, sentAt: true, jobId: true, job: { select: { id: true, leadId: true, status: true, completedAt: true, customer: { select: personSelect }, lead: { select: personSelect } } } },
    }),
    prisma.jobBilling.findMany({
      where: { businessId, status: "succeeded", job: { invoices: { none: { status: live } } } },
      take,
      select: { jobId: true, amountCents: true, attempts: true, lastError: true, attemptedAt: true, status: true, notifyStatus: true, job: { select: { id: true, leadId: true, completedAt: true, customer: { select: personSelect }, lead: { select: personSelect }, invoices: { where: { status: { in: ["void", "refunded"] } }, select: { id: true }, take: 1 } } } },
    }),
  ]);

  const out: BillingException[] = [];
  for (const job of unbilled) {
    const who = person(job);
    const blocked = job.invoices[0] ?? null;
    out.push({
      kind: blocked || job.billing?.status === "succeeded" ? "inconsistent" : "creation",
      jobId: job.id,
      ...who,
      leadId: job.leadId,
      completedAt: job.completedAt?.toISOString() ?? null,
      amountCents: job.finalAmountCents,
      invoiceId: blocked?.id ?? null,
      invoiceStatus: blocked?.status ?? null,
      sentAt: null,
      notifyStatus: job.billing?.notifyStatus ?? null,
      billingStatus: job.billing?.status ?? "required",
      attempts: job.billing?.attempts ?? 0,
      lastError: job.billing?.lastError ?? (blocked ? (blocked.status === "void" ? VOIDED : REFUNDED) : null),
      attemptedAt: job.billing?.attemptedAt?.toISOString() ?? null,
    });
  }
  for (const invoice of unsent) {
    const who = person(invoice.job);
    out.push({
      kind: "notification",
      jobId: invoice.jobId,
      ...who,
      leadId: invoice.job?.leadId ?? null,
      completedAt: invoice.job?.completedAt?.toISOString() ?? null,
      amountCents: invoice.amountCents,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      sentAt: null,
      notifyStatus: invoice.job?.billing?.notifyStatus ?? "not_sent",
      billingStatus: invoice.job?.billing?.status ?? null,
      attempts: invoice.job?.billing?.attempts ?? 0,
      lastError: invoice.job?.billing?.notifyError ?? null,
      attemptedAt: invoice.job?.billing?.notifyAttemptedAt?.toISOString() ?? null,
    });
  }
  for (const invoice of unpaid) {
    const who = person(invoice.job);
    out.push({
      kind: "collection",
      jobId: invoice.jobId,
      ...who,
      leadId: invoice.job?.leadId ?? null,
      completedAt: invoice.job?.completedAt?.toISOString() ?? null,
      amountCents: invoice.amountCents,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      notifyStatus: invoice.job?.billing?.notifyStatus ?? "sent",
      billingStatus: invoice.job?.billing?.status ?? null,
      attempts: invoice.job?.billing?.attempts ?? 0,
      lastError: null,
      attemptedAt: invoice.sentAt?.toISOString() ?? null,
    });
  }
  for (const job of noCharge) {
    const invoice = job.invoices[0];
    if (!invoice) continue;
    const who = person(job);
    out.push({
      kind: "inconsistent",
      jobId: job.id,
      ...who,
      leadId: job.leadId,
      completedAt: job.completedAt?.toISOString() ?? null,
      amountCents: job.finalAmountCents,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      notifyStatus: job.billing?.notifyStatus ?? null,
      billingStatus: job.billing?.status ?? null,
      attempts: job.billing?.attempts ?? 0,
      lastError: "This job was no charge, but it has an open bill. The bill was not changed.",
      attemptedAt: job.billing?.attemptedAt?.toISOString() ?? null,
    });
  }
  for (const invoice of paidEarly) {
    const who = person(invoice.job);
    out.push({
      kind: "inconsistent",
      jobId: invoice.jobId,
      ...who,
      leadId: invoice.job?.leadId ?? null,
      completedAt: null,
      amountCents: invoice.amountCents,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      notifyStatus: null,
      billingStatus: null,
      attempts: 0,
      lastError: `The bill is ${invoice.status}, but the job is ${invoice.job?.status ?? "missing"}. Nothing was collected or reversed from here.`,
      attemptedAt: null,
    });
  }
  const seenJobs = new Set(out.map((row) => row.jobId));
  for (const row of orphanSucceeded) {
    if (seenJobs.has(row.jobId) || row.job.invoices.length) continue;
    const who = person(row.job);
    out.push({
      kind: "inconsistent",
      jobId: row.jobId,
      ...who,
      leadId: row.job.leadId,
      completedAt: row.job.completedAt?.toISOString() ?? null,
      amountCents: row.amountCents,
      invoiceId: null,
      invoiceStatus: null,
      sentAt: null,
      notifyStatus: row.notifyStatus,
      billingStatus: row.status,
      attempts: row.attempts,
      lastError: row.lastError ?? "Billing says the invoice was opened, but no invoice is there.",
      attemptedAt: row.attemptedAt?.toISOString() ?? null,
    });
  }
  return out;
}

const KIND_WORD = {
  creation: "done, not billed",
  notification: "bill not sent",
  collection: "bill not paid",
  inconsistent: "billing doesn't match",
} as const;

/** One line for the desk. Creation, sending, and payment stay different sentences. */
export function billingExceptionDetail(row: BillingException) {
  const who = row.customer?.trim() || row.phone || "Customer";
  const amount = row.amountCents != null ? formatCentsExact(row.amountCents) : null;
  const done = row.completedAt ? row.completedAt.slice(0, 16).replace("T", " ") : "an unknown time";
  const job = row.jobId ? `Job ${row.jobId}. ` : "";
  if (row.kind === "creation") {
    const state = row.billingStatus === "failed" ? "failed" : row.billingStatus === "pending" ? "in progress" : "still required";
    const attempt = row.attempts ? `${row.attempts} attempt${row.attempts === 1 ? "" : "s"}` : "no attempt yet";
    const when = row.attemptedAt ? `, last at ${row.attemptedAt.slice(0, 16).replace("T", " ")}` : "";
    const why = row.lastError ? ` ${row.lastError}` : "";
    return {
      title: `${who} · ${KIND_WORD.creation}`,
      detail: `${job}Done ${done}. Billable ${amount ?? "unverified"}. Invoice not created (${state}, ${attempt}${when}).${why}`,
    };
  }
  if (row.kind === "notification") {
    const failed = row.notifyStatus === "failed";
    return {
      title: `${who} · ${KIND_WORD.notification}`,
      detail: `${job}Done ${done}. Invoice ${row.invoiceId ?? ""} is ${row.invoiceStatus ?? "open"} for ${amount ?? "an unknown amount"}. ${failed ? `The text failed${row.lastError ? `: ${row.lastError}` : ""}.` : "It has not been sent."} It has not been paid.`,
    };
  }
  if (row.kind === "collection") {
    return {
      title: `${who} · ${KIND_WORD.collection}`,
      detail: `${job}Invoice ${row.invoiceId ?? ""} for ${amount ?? "an unknown amount"} was sent${row.sentAt ? ` ${row.sentAt.slice(0, 16).replace("T", " ")}` : ""}. It has not been paid.`,
    };
  }
  return {
    title: `${who} · ${KIND_WORD.inconsistent}`,
    detail: `${job}${row.lastError ?? "The job and the bill disagree."} Nothing was charged, sent, or repriced to repair it.`,
  };
}

/**
 * Finish bills that were left required, failed, or pending after a crash.
 * Does not text and does not reprice. Test shops are skipped unless a test asks.
 */
export async function sweepUnbilledJobs(options: { limit?: number; includeTest?: boolean; businessId?: string } = {}) {
  const limit = options.limit ?? 25;
  const cutoff = new Date(Date.now() - BILLING_LEASE_MS);
  const shop = options.businessId ? { businessId: options.businessId } : options.includeTest ? {} : { business: { environment: { not: "test" as const } } };
  let pending: { jobId: string }[] = [];
  let missing: { id: string }[] = [];
  try {
    [pending, missing] = await Promise.all([
      prisma.jobBilling.findMany({
        where: {
          ...shop,
          OR: [
            { status: "required" },
            { status: "failed", OR: [{ lastError: null }, { lastError: { notIn: [VOIDED, REFUNDED] } }] },
            { status: "pending", OR: [{ claimedAt: null }, { claimedAt: { lt: cutoff } }] },
          ],
        },
        orderBy: [{ attemptedAt: "asc" }, { createdAt: "asc" }],
        take: limit,
        select: { jobId: true },
      }),
      prisma.job.findMany({
        where: {
          ...shop,
          status: "completed",
          finalAmountCents: { gt: 0 },
          completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          billing: { is: null },
          invoices: { none: {} },
        },
        orderBy: { completedAt: "asc" },
        take: limit,
        select: { id: true },
      }),
    ]);
  } catch (error) {
    if (schemaMissing(error)) return { examined: 0, settled: 0, failed: 0, skipped: "schema" as const };
    throw error;
  }
  const ids = [...new Set([...pending.map((row) => row.jobId), ...missing.map((job) => job.id)])].slice(0, limit);
  let settled = 0;
  let failed = 0;
  for (const jobId of ids) {
    const result = await settleJobBilling(jobId);
    if (result.outcome === "succeeded" || result.outcome === "not_required") settled += 1;
    else if (result.outcome === "failed") failed += 1;
  }
  return { examined: ids.length, settled, failed, skipped: null };
}

/** A person's retry. Opens the invoice when that is safe, writes an audit row, and does not text or reprice. */
export async function retryJobBilling(params: { businessId: string; jobId: string; actor: AuditActor; actorEmail?: string | null }) {
  const job = await prisma.job.findFirst({ where: { id: params.jobId, businessId: params.businessId }, select: { id: true, status: true, customerId: true, leadId: true } });
  if (!job) return { found: false as const };
  const settled = job.status === "completed" ? await settleJobBilling(job.id, { businessId: params.businessId }) : ({ outcome: "skipped", reason: "not_completed" } as const);
  const summary =
    settled.outcome === "succeeded"
      ? "Opened the bill. It was not sent."
      : settled.outcome === "not_required"
        ? "No bill is owed on this job. None was opened."
        : settled.outcome === "failed"
          ? `The bill is still not open: ${settled.error}`
          : settled.outcome === "pending"
            ? "The bill is already being opened."
            : "The job is not done, so no bill was opened.";
  await recordAudit({
    businessId: params.businessId,
    entityType: "job",
    entityId: job.id,
    jobId: job.id,
    customerId: job.customerId,
    leadId: job.leadId,
    action: "job.billing_retried",
    actor: params.actor,
    actorEmail: params.actorEmail,
    summary,
    detail: {
      outcome: settled.outcome,
      ...("reason" in settled ? { reason: settled.reason } : {}),
      ...("error" in settled ? { error: settled.error } : {}),
      ...("invoiceId" in settled ? { invoiceId: settled.invoiceId, created: settled.created } : {}),
      ...("amountCents" in settled ? { amountCents: settled.amountCents } : {}),
    },
  });
  return { found: true as const, settled };
}
