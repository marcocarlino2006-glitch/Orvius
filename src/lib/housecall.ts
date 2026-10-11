import { describeSlot } from "@/lib/in-call-tool-defs";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret, secretBoxConfigured } from "@/lib/secret-box";

/**
 * Housecall Pro: every call Orvius captures lands in the shop's Housecall Pro
 * as a lead, against the customer matched by phone or created once.
 *
 * Housecall Pro has no app sign-in for this; the owner generates an API key in
 * Housecall Pro (MAX plan, My Apps → API Key Management) and pastes it here.
 * The key is sealed at rest and never shown back.
 *
 * Sending is at-most-once, as with Jobber: the row is stamped before the lead
 * is sent, so a lost reply leaves a "check" row for a person, never a second lead.
 */

const CLAIM_STALE_MS = 5 * 60_000;
export const MAX_HOUSECALL_ATTEMPTS = 5;

export class HousecallAuthError extends Error {}
export class HousecallError extends Error {}

/* Tests point this at a fake Housecall Pro; production always talks to Housecall Pro. */
export function housecallApiBase() {
  const override = process.env.HOUSECALL_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") return override.replace(/\/$/, "");
  return "https://api.housecallpro.com";
}

export function housecallConfigured() {
  return secretBoxConfigured();
}

export async function housecallRequest<T>(apiKey: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${housecallApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new HousecallAuthError(`Housecall Pro refused the API key (${res.status})`);
  const data = (await res.json().catch(() => null)) as (T & { error?: unknown; message?: string }) | null;
  if (!res.ok || !data) {
    const why = typeof data?.message === "string" ? `: ${data.message}` : "";
    throw new HousecallError(`Housecall Pro ${res.status}${why}`.slice(0, 300));
  }
  return data;
}

/** A pasted key → a stored, sealed connection, only once Housecall Pro accepts it. */
export async function connectHousecall(params: { businessId: string; apiKey: string; now?: Date }) {
  const apiKey = params.apiKey.trim();
  if (apiKey.length < 16 || /\s/.test(apiKey)) throw new HousecallAuthError("That doesn't look like a Housecall Pro API key.");
  const company = await housecallRequest<{ id?: string | number; name?: string | null }>(apiKey, "GET", "/company");
  const data = {
    companyId: company.id != null ? String(company.id) : null,
    companyName: company.name?.trim() || null,
    apiKeyEnc: sealSecret(apiKey),
    status: "active",
    lastError: null,
    connectedAt: params.now ?? new Date(),
    disconnectedAt: null,
  };
  return prisma.housecallConnection.upsert({
    where: { businessId: params.businessId },
    create: { businessId: params.businessId, ...data },
    update: data,
  });
}

export async function disconnectHousecall(businessId: string) {
  await prisma.housecallConnection.updateMany({
    where: { businessId },
    data: { apiKeyEnc: null, status: "disconnected", disconnectedAt: new Date() },
  });
}

async function housecallKey(businessId: string): Promise<{ id: string; key: string } | null> {
  const conn = await prisma.housecallConnection.findUnique({ where: { businessId } });
  if (!conn || conn.status !== "active") return null;
  const key = openSecret(conn.apiKeyEnc);
  if (!key) {
    await needsReconnect(conn.id, "The stored key could not be read");
    return null;
  }
  return { id: conn.id, key };
}

async function needsReconnect(connectionId: string, reason: string) {
  await prisma.housecallConnection.update({ where: { id: connectionId }, data: { apiKeyEnc: null, status: "reconnect", lastError: reason } });
  logWarn("housecall.needs_reconnect", { connectionId, reason });
}

/* ── Leads into Housecall Pro ──────────────────────────────────────────── */

/** Leads that are new work. A call about an existing visit, a complaint or a question is not a Housecall Pro lead. */
const NOT_NEW_WORK = new Set(["existing_job", "follow_up", "complaint", "info_only", "not_found", "missing_business"]);

export async function enqueueHousecallSync(params: { businessId: string; leadId: string; skipReason?: string | null; nonService?: boolean }) {
  if (params.nonService || (params.skipReason && NOT_NEW_WORK.has(params.skipReason))) return false;
  const conn = await prisma.housecallConnection.findUnique({ where: { businessId: params.businessId }, select: { status: true } });
  if (conn?.status !== "active") return false;
  try {
    await prisma.housecallSync.create({ data: { businessId: params.businessId, leadId: params.leadId } });
    return true;
  } catch {
    return false;
  }
}

type LeadForHousecall = {
  name: string | null;
  phone: string | null;
  address: string | null;
  serviceType: string | null;
  urgency: string | null;
  notes: string | null;
};

function splitName(name: string | null, phone: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Caller", last_name: displayPhone(phone) ?? phone };
  if (parts.length === 1) return { first_name: parts[0], last_name: "(Orvius caller)" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

export function housecallLeadNote(lead: LeadForHousecall, job: { scheduledAt: Date | null } | null, timezone: string) {
  const booked = job?.scheduledAt ? describeSlot(job.scheduledAt, timezone) : null;
  return [
    `${lead.serviceType?.trim() || "Service request"}, from a call answered by Orvius.`,
    lead.urgency ? `Urgency: ${lead.urgency}.` : null,
    lead.address ? `Address: ${lead.address}.` : null,
    lead.phone ? `Callback: ${displayPhone(lead.phone) ?? lead.phone}.` : null,
    booked ? `Orvius booked ${booked} on its schedule. Confirm it here if you schedule in Housecall Pro.` : null,
    lead.notes?.trim() ? `Notes: ${lead.notes.trim().slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

type HousecallCustomer = { id?: string | number; mobile_number?: string | null; home_number?: string | null; work_number?: string | null };

async function findOrCreateCustomer(key: string, lead: LeadForHousecall, customer: { id: string; housecallCustomerId: string | null } | null) {
  if (customer?.housecallCustomerId) return customer.housecallCustomerId;
  const phone = normalizePhone(lead.phone ?? "");
  if (!phone) throw new HousecallError("Lead has no usable phone number");
  const national = phone.replace(/\D/g, "").slice(-10);
  const found = await housecallRequest<{ customers?: HousecallCustomer[] }>(key, "GET", `/customers?q=${encodeURIComponent(national)}&page_size=10`);
  const digits = (n: string | null | undefined) => (n ?? "").replace(/\D/g, "");
  const match = (found.customers ?? []).find((c) => c.id != null && [c.mobile_number, c.home_number, c.work_number].some((n) => digits(n).endsWith(national)));
  let customerId = match?.id != null ? String(match.id) : null;
  if (!customerId) {
    const created = await housecallRequest<HousecallCustomer>(key, "POST", "/customers", {
      ...splitName(lead.name, phone),
      mobile_number: national,
      lead_source: "Orvius",
    });
    if (created.id == null) throw new HousecallError("Housecall Pro did not return the new customer");
    customerId = String(created.id);
  }
  if (customer) await prisma.customer.update({ where: { id: customer.id }, data: { housecallCustomerId: customerId } });
  return customerId;
}

function backoff(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts);
}

async function processSync(syncId: string) {
  const sync = await prisma.housecallSync.findUniqueOrThrow({ where: { id: syncId } });
  if (sync.requestSentAt && !sync.housecallLeadId) {
    await prisma.housecallSync.update({
      where: { id: sync.id },
      data: { status: "check", claimedAt: null, lastError: "Sent to Housecall Pro but the reply was lost. Check Housecall Pro before sending again." },
    });
    return "check" as const;
  }
  const lead = await prisma.lead.findUnique({
    where: { id: sync.leadId },
    select: {
      name: true,
      phone: true,
      address: true,
      serviceType: true,
      urgency: true,
      notes: true,
      customer: { select: { id: true, housecallCustomerId: true } },
      job: { select: { scheduledAt: true } },
      business: { select: { timezone: true } },
    },
  });
  if (!lead) {
    await prisma.housecallSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "Lead no longer exists" } });
    return "skipped" as const;
  }
  const conn = await housecallKey(sync.businessId);
  if (!conn) {
    await prisma.housecallSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "Housecall Pro is not connected" } });
    return "skipped" as const;
  }

  try {
    const customerId = await findOrCreateCustomer(conn.key, lead, lead.customer);
    await prisma.housecallSync.update({ where: { id: sync.id }, data: { housecallCustomerId: customerId, requestSentAt: new Date() } });
    let created: { id?: string | number };
    try {
      created = await housecallRequest<{ id?: string | number }>(conn.key, "POST", "/leads", {
        customer_id: customerId,
        lead_source: "Orvius",
        note: housecallLeadNote(lead, lead.job, lead.business?.timezone ?? "America/New_York"),
      });
    } catch (error) {
      // Refused outright (4xx other than auth): nothing was created, so it is safe to try again.
      if (error instanceof HousecallError && /Housecall Pro 4\d\d/.test(error.message)) {
        await prisma.housecallSync.update({ where: { id: sync.id }, data: { requestSentAt: null } });
      }
      throw error;
    }
    await prisma.housecallSync.update({
      where: { id: sync.id },
      data: { status: "done", claimedAt: null, housecallLeadId: created.id != null ? String(created.id) : "unknown", lastError: null },
    });
    logInfo("housecall.lead_created", { businessId: sync.businessId, leadId: sync.leadId });
    return "done" as const;
  } catch (error) {
    if (error instanceof HousecallAuthError) {
      await needsReconnect(conn.id, "Housecall Pro refused the API key");
      await prisma.housecallSync.update({ where: { id: sync.id }, data: { requestSentAt: null } });
    }
    throw error;
  }
}

/** Send what is due. Each row is claimed first, so overlapping runs never send the same lead. */
export async function drainHousecallSyncs(options: { limit?: number; now?: Date; businessId?: string; budgetMs?: number } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 45_000);
  const due = await prisma.housecallSync.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: now },
      ...(options.businessId ? { businessId: options.businessId } : {}),
      OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: options.limit ?? 25,
    select: { id: true, claimedAt: true, attempts: true, businessId: true },
  });
  const tally = { done: 0, skipped: 0, check: 0, retry: 0, failed: 0 };
  for (const row of due) {
    if (Date.now() > stopAt) break;
    const claimed = await prisma.housecallSync.updateMany({
      where: { id: row.id, status: "pending", claimedAt: row.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      tally[await processSync(row.id)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_HOUSECALL_ATTEMPTS || error instanceof HousecallAuthError;
      await prisma.housecallSync.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "failed" : "pending",
          claimedAt: null,
          lastError: message.slice(0, 300),
          nextAttemptAt: new Date(now.getTime() + backoff(attempts)),
        },
      });
      tally[giveUp ? "failed" : "retry"] += 1;
      (giveUp ? logError : logWarn)("housecall.sync_failed", { businessId: row.businessId, syncId: row.id, attempts, error: message });
    }
  }
  return tally;
}

/** What Settings shows. */
export async function housecallStatus(businessId: string) {
  const [conn, recent, failing] = await Promise.all([
    prisma.housecallConnection.findUnique({ where: { businessId }, select: { status: true, companyName: true, connectedAt: true, lastError: true } }),
    prisma.housecallSync.count({ where: { businessId, status: "done", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.housecallSync.count({ where: { businessId, status: { in: ["failed", "check"] } } }),
  ]);
  return {
    available: housecallConfigured(),
    status: conn?.status ?? "none",
    companyName: conn?.companyName ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
    lastError: conn?.status === "reconnect" ? conn.lastError : null,
    sentLast30Days: recent,
    needsAttention: failing,
  };
}
