import { createHash } from "node:crypto";
import { describeSlot } from "@/lib/in-call-tool-defs";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret, secretBoxConfigured } from "@/lib/secret-box";

/**
 * ServiceTitan: every new-work call lands in the shop's ServiceTitan booking
 * queue, where the shop's own CSRs and rules turn it into a job.
 *
 * ServiceTitan only lets approved apps in. Orvius's app key (SERVICETITAN_APP_KEY)
 * comes from the ServiceTitan developer program; until it is set, nothing here
 * is offered. Each shop then connects the Orvius app under Settings → Integrations
 * → API Application Access in ServiceTitan and pastes its tenant id, client id
 * and client secret. The secret is sealed at rest and never shown back.
 *
 * Sending is at-most-once, as with Jobber: the row is stamped before the booking
 * is sent, so a lost reply leaves a "check" row for a person, never a second booking.
 */

const CLAIM_STALE_MS = 5 * 60_000;
const TOKEN_EARLY_MS = 60_000;
export const MAX_SERVICETITAN_ATTEMPTS = 5;

export class ServiceTitanAuthError extends Error {}
export class ServiceTitanSetupError extends Error {}
export class ServiceTitanError extends Error {}

/* Tests point both hosts at a fake ServiceTitan; production always talks to ServiceTitan. */
function hosts() {
  const override = process.env.SERVICETITAN_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") {
    const base = override.replace(/\/$/, "");
    return { auth: base, api: base };
  }
  return process.env.SERVICETITAN_ENV?.trim() === "integration"
    ? { auth: "https://auth-integration.servicetitan.io", api: "https://api-integration.servicetitan.io" }
    : { auth: "https://auth.servicetitan.io", api: "https://api.servicetitan.io" };
}

export function serviceTitanConfigured() {
  return Boolean(process.env.SERVICETITAN_APP_KEY?.trim() && secretBoxConfigured());
}

type Credentials = { tenantId: string; clientId: string; clientSecret: string };

/* Client-credentials tokens last about 15 minutes; one per tenant is reused across a drain. */
const tokens = new Map<string, { token: string; expiresAt: number }>();

/* Keyed by the secret too: a wrong secret must never ride on a token another one earned. */
function tokenKey(creds: Credentials) {
  return createHash("sha256").update(`${creds.tenantId}\n${creds.clientId}\n${creds.clientSecret}`).digest("hex");
}

async function accessToken(creds: Credentials): Promise<string> {
  const cacheKey = tokenKey(creds);
  const cached = tokens.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > TOKEN_EARLY_MS) return cached.token;
  const res = await fetch(`${hosts().auth}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (res.status === 400 || res.status === 401) throw new ServiceTitanAuthError(data.error ?? `token ${res.status}`);
  if (!res.ok || !data.access_token) throw new ServiceTitanError(`ServiceTitan token ${res.status}`);
  tokens.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 900) * 1000 });
  return data.access_token;
}

export async function serviceTitanRequest<T>(
  creds: Credentials,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  module: "crm" | "jpm" = "crm",
): Promise<T> {
  const token = await accessToken(creds);
  const res = await fetch(`${hosts().api}/${module}/v2/tenant/${encodeURIComponent(creds.tenantId)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "ST-App-Key": process.env.SERVICETITAN_APP_KEY?.trim() ?? "",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) {
    tokens.delete(tokenKey(creds));
    throw new ServiceTitanAuthError(`ServiceTitan refused access (${res.status})`);
  }
  const data = (await res.json().catch(() => null)) as (T & { title?: string; message?: string }) | null;
  if (!res.ok || !data) {
    const why = data?.title ?? data?.message;
    throw new ServiceTitanError(`ServiceTitan ${res.status}${why ? `: ${why}` : ""}`.slice(0, 300));
  }
  return data;
}

type ProviderTag = { id?: string | number; tagName?: string | null; name?: string | null; active?: boolean };

/** The booking provider tag calls arrive under: one named "Orvius", or the shop's only one. */
export function pickProvider(tags: ProviderTag[]): { id: string; name: string | null } | null {
  const usable = tags.filter((t) => t.id != null && t.active !== false);
  const label = (t: ProviderTag) => (t.tagName ?? t.name ?? "").trim();
  const named = usable.find((t) => /orvius/i.test(label(t)));
  const pick = named ?? (usable.length === 1 ? usable[0] : null);
  return pick ? { id: String(pick.id), name: label(pick) || null } : null;
}

/** Pasted credentials → a stored, sealed connection, only once ServiceTitan accepts them. */
export async function connectServiceTitan(params: { businessId: string; tenantId: string; clientId: string; clientSecret: string; now?: Date }) {
  const creds = { tenantId: params.tenantId.trim(), clientId: params.clientId.trim(), clientSecret: params.clientSecret.trim() };
  if (!/^\d{3,20}$/.test(creds.tenantId)) throw new ServiceTitanSetupError("The tenant ID is the number ServiceTitan shows with your client ID.");
  if (!creds.clientId || !creds.clientSecret || /\s/.test(creds.clientId + creds.clientSecret)) {
    throw new ServiceTitanAuthError("Paste the client ID and client secret exactly as ServiceTitan shows them.");
  }
  const tags = await serviceTitanRequest<{ data?: ProviderTag[] }>(creds, "GET", "/booking-provider-tags?pageSize=50");
  const provider = pickProvider(tags.data ?? []);
  if (!provider) {
    throw new ServiceTitanSetupError(
      "In ServiceTitan, add a booking provider tag named Orvius (Settings → Integrations → Booking Provider Tags), then connect again.",
    );
  }
  const data = {
    tenantId: creds.tenantId,
    clientId: creds.clientId,
    clientSecretEnc: sealSecret(creds.clientSecret),
    providerId: provider.id,
    providerName: provider.name,
    status: "active",
    lastError: null,
    connectedAt: params.now ?? new Date(),
    disconnectedAt: null,
  };
  return prisma.serviceTitanConnection.upsert({
    where: { businessId: params.businessId },
    create: { businessId: params.businessId, ...data },
    update: data,
  });
}

export async function disconnectServiceTitan(businessId: string) {
  await prisma.serviceTitanConnection.updateMany({
    where: { businessId },
    data: { clientSecretEnc: null, status: "disconnected", disconnectedAt: new Date() },
  });
}

async function connection(businessId: string) {
  const conn = await prisma.serviceTitanConnection.findUnique({ where: { businessId } });
  if (!conn || conn.status !== "active") return null;
  const clientSecret = openSecret(conn.clientSecretEnc);
  if (!clientSecret) {
    await needsReconnect(conn.id, "The stored secret could not be read");
    return null;
  }
  return { id: conn.id, providerId: conn.providerId, creds: { tenantId: conn.tenantId, clientId: conn.clientId, clientSecret } };
}

async function needsReconnect(connectionId: string, reason: string) {
  await prisma.serviceTitanConnection.update({ where: { id: connectionId }, data: { clientSecretEnc: null, status: "reconnect", lastError: reason } });
  logWarn("servicetitan.needs_reconnect", { connectionId, reason });
}

/* ── Calls into the ServiceTitan booking queue ─────────────────────────── */

/** Leads that are new work. A call about an existing visit, a complaint or a question is not a booking. */
const NOT_NEW_WORK = new Set(["existing_job", "follow_up", "complaint", "info_only", "not_found", "missing_business"]);

export async function enqueueServiceTitanSync(params: { businessId: string; leadId: string; skipReason?: string | null; nonService?: boolean }) {
  if (params.nonService || (params.skipReason && NOT_NEW_WORK.has(params.skipReason))) return false;
  const conn = await prisma.serviceTitanConnection.findUnique({ where: { businessId: params.businessId }, select: { status: true } });
  if (conn?.status !== "active") return false;
  try {
    await prisma.serviceTitanSync.create({ data: { businessId: params.businessId, leadId: params.leadId } });
    return true;
  } catch {
    return false;
  }
}

type LeadForBooking = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  serviceType: string | null;
  urgency: string | null;
  notes: string | null;
};

/** "12 Oak St, Evanston, IL 60201" → ServiceTitan's parts. Anything less certain stays in the summary only. */
export function splitUsAddress(address: string | null) {
  const m = address?.trim().match(/^(.+?),\s*([^,]+?),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:,?\s*(?:USA?|United States))?$/i);
  if (!m) return null;
  return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4], country: "USA" };
}

export function serviceTitanBooking(lead: LeadForBooking, job: { scheduledAt: Date | null } | null, timezone: string, firstTime: boolean) {
  const booked = job?.scheduledAt ? describeSlot(job.scheduledAt, timezone) : null;
  const phone = normalizePhone(lead.phone ?? "");
  const summary = [
    `${lead.serviceType?.trim() || "Service request"}, from a call answered by Orvius.`,
    lead.urgency ? `Urgency: ${lead.urgency}.` : null,
    lead.address ? `Address: ${lead.address}.` : null,
    phone ? `Callback: ${displayPhone(phone) ?? phone}.` : null,
    booked ? `Orvius booked ${booked} on its schedule. Confirm it here before dispatching.` : null,
    lead.notes?.trim() ? `Notes: ${lead.notes.trim().slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const address = splitUsAddress(lead.address);
  return {
    source: "Orvius",
    externalId: lead.id,
    name: lead.name?.trim() || (phone ? `Caller ${displayPhone(phone) ?? phone}` : "Orvius caller"),
    summary,
    isFirstTimeClient: firstTime,
    ...(address ? { address } : {}),
    ...(phone ? { contacts: [{ type: "Phone", value: phone.replace(/\D/g, "").slice(-10) }] } : {}),
    ...(job?.scheduledAt ? { start: job.scheduledAt.toISOString() } : {}),
  };
}

function backoff(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts);
}

async function processSync(syncId: string) {
  const sync = await prisma.serviceTitanSync.findUniqueOrThrow({ where: { id: syncId } });
  if (sync.requestSentAt && !sync.bookingId) {
    await prisma.serviceTitanSync.update({
      where: { id: sync.id },
      data: { status: "check", claimedAt: null, lastError: "Sent to ServiceTitan but the reply was lost. Check the booking queue before sending again." },
    });
    return "check" as const;
  }
  const lead = await prisma.lead.findUnique({
    where: { id: sync.leadId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      serviceType: true,
      urgency: true,
      notes: true,
      customerId: true,
      job: { select: { scheduledAt: true } },
      business: { select: { timezone: true } },
    },
  });
  if (!lead) {
    await prisma.serviceTitanSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "Lead no longer exists" } });
    return "skipped" as const;
  }
  const conn = await connection(sync.businessId);
  if (!conn) {
    await prisma.serviceTitanSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "ServiceTitan is not connected" } });
    return "skipped" as const;
  }
  const earlierCalls = lead.customerId ? await prisma.lead.count({ where: { customerId: lead.customerId, id: { not: lead.id } } }) : 0;
  const body = serviceTitanBooking(lead, lead.job, lead.business?.timezone ?? "America/New_York", earlierCalls === 0);

  try {
    // Fetch the token before stamping, so a refused or unreachable login is retried rather than held for a person.
    await accessToken(conn.creds);
    await prisma.serviceTitanSync.update({ where: { id: sync.id }, data: { requestSentAt: new Date() } });
    let created: { id?: string | number };
    try {
      created = await serviceTitanRequest<{ id?: string | number }>(conn.creds, "POST", `/booking-provider/${encodeURIComponent(conn.providerId)}/bookings`, body);
    } catch (error) {
      // Refused outright: nothing was created, so it is safe to try again.
      if (error instanceof ServiceTitanAuthError || (error instanceof ServiceTitanError && /ServiceTitan 4\d\d/.test(error.message))) {
        await prisma.serviceTitanSync.update({ where: { id: sync.id }, data: { requestSentAt: null } });
      }
      throw error;
    }
    await prisma.serviceTitanSync.update({
      where: { id: sync.id },
      data: { status: "done", claimedAt: null, bookingId: created.id != null ? String(created.id) : "unknown", lastError: null },
    });
    logInfo("servicetitan.booking_created", { businessId: sync.businessId, leadId: sync.leadId });
    return "done" as const;
  } catch (error) {
    if (error instanceof ServiceTitanAuthError) await needsReconnect(conn.id, "ServiceTitan refused the Orvius credentials");
    throw error;
  }
}

/** Send what is due. Each row is claimed first, so overlapping runs never send the same lead. */
export async function drainServiceTitanSyncs(options: { limit?: number; now?: Date; businessId?: string; budgetMs?: number } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 45_000);
  const due = await prisma.serviceTitanSync.findMany({
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
    const claimed = await prisma.serviceTitanSync.updateMany({
      where: { id: row.id, status: "pending", claimedAt: row.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      tally[await processSync(row.id)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_SERVICETITAN_ATTEMPTS || error instanceof ServiceTitanAuthError;
      await prisma.serviceTitanSync.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "failed" : "pending",
          claimedAt: null,
          lastError: message.slice(0, 300),
          nextAttemptAt: new Date(now.getTime() + backoff(attempts)),
        },
      });
      tally[giveUp ? "failed" : "retry"] += 1;
      (giveUp ? logError : logWarn)("servicetitan.sync_failed", { businessId: row.businessId, syncId: row.id, attempts, error: message });
    }
  }
  return tally;
}

/** What Settings shows. */
export async function serviceTitanStatus(businessId: string) {
  const [conn, recent, failing] = await Promise.all([
    prisma.serviceTitanConnection.findUnique({ where: { businessId }, select: { status: true, providerName: true, connectedAt: true, lastError: true } }),
    prisma.serviceTitanSync.count({ where: { businessId, status: "done", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.serviceTitanSync.count({ where: { businessId, status: { in: ["failed", "check"] } } }),
  ]);
  return {
    available: serviceTitanConfigured(),
    status: conn?.status ?? "none",
    providerName: conn?.providerName ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
    lastError: conn?.status === "reconnect" ? conn.lastError : null,
    sentLast30Days: recent,
    needsAttention: failing,
  };
}

/* ── The shop's ServiceTitan schedule, read so Orvius doesn't offer a taken time ── */

type ServiceTitanAppointment = { id?: number | string; start?: string | null; end?: string | null; status?: string | null };

const SERVICETITAN_DONE = new Set(["done", "canceled", "cancelled"]);

/** Appointments starting in [from, to), or null when ServiceTitan isn't connected. */
export async function serviceTitanScheduledVisits(businessId: string, from: Date, to: Date) {
  const conn = await connection(businessId);
  if (!conn) return null;
  const visits: Array<{ start: Date; end: Date; phone: string | null }> = [];
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({
      startsOnOrAfter: from.toISOString(),
      startsBefore: to.toISOString(),
      page: String(page),
      pageSize: "200",
    });
    let data: { data?: ServiceTitanAppointment[]; hasMore?: boolean };
    try {
      data = await serviceTitanRequest(conn.creds, "GET", `/appointments?${query}`, undefined, "jpm");
    } catch (error) {
      if (error instanceof ServiceTitanAuthError) await needsReconnect(conn.id, error.message);
      throw error;
    }
    for (const appt of data.data ?? []) {
      if (SERVICETITAN_DONE.has((appt.status ?? "").toLowerCase()) || !appt.start) continue;
      const start = new Date(appt.start);
      const end = appt.end ? new Date(appt.end) : new Date(start.getTime() + 2 * 60 * 60_000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      visits.push({ start, end, phone: null });
    }
    if (!data.hasMore) break;
  }
  return visits;
}
