import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { describeSlot } from "@/lib/in-call-tool-defs";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { getAppUrl } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret, secretBoxConfigured } from "@/lib/secret-box";

/**
 * Jobber: every call Orvius captures lands in the shop's Jobber as a request,
 * the inbox Jobber shops already work from, against the client matched by phone
 * or created once.
 *
 * Sending is at-most-once. A lead has one JobberSync row; the row is stamped
 * before the request is sent, so a crash between Jobber accepting it and us
 * recording it leaves a "check" row for a person, never a second request.
 */

export const JOBBER_GRAPHQL_VERSION = "2025-04-16";
const REFRESH_EARLY_MS = 5 * 60_000;
const REFRESH_CLAIM_MS = 30_000;
const CLAIM_STALE_MS = 5 * 60_000;
export const MAX_SYNC_ATTEMPTS = 5;

export class JobberAuthError extends Error {}
export class JobberError extends Error {}

/* Tests point this at a fake Jobber; production always talks to Jobber. */
export function jobberApiBase() {
  const override = process.env.JOBBER_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") return override.replace(/\/$/, "");
  return "https://api.getjobber.com";
}

export function jobberConfigured() {
  return Boolean(process.env.JOBBER_CLIENT_ID?.trim() && process.env.JOBBER_CLIENT_SECRET?.trim() && secretBoxConfigured());
}

export function jobberRedirectUri() {
  return `${getAppUrl().replace(/\/$/, "")}/api/integrations/jobber/callback`;
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function jobberAuthorizeUrl(params: { state: string; codeChallenge: string }) {
  const url = new URL(`${jobberApiBase()}/api/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.JOBBER_CLIENT_ID?.trim() ?? "");
  url.searchParams.set("redirect_uri", jobberRedirectUri());
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export const JOBBER_OAUTH_COOKIE = "orvius_jobber_oauth";
const OAUTH_TTL_MS = 10 * 60_000;

/** State + PKCE verifier for the round trip, sealed so the browser can hold it but not read or forge it. */
export function sealOAuthState(businessId: string, now = new Date()) {
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const sealed = sealSecret(JSON.stringify({ state, verifier, businessId, exp: now.getTime() + OAUTH_TTL_MS }));
  const cookie = Buffer.from(sealed, "utf8").toString("base64url");
  return { state, challenge, cookie };
}

export function openOAuthState(cookie: string | null | undefined, state: string | null, businessId: string, now = new Date()) {
  if (!cookie || !state) return null;
  try {
    const raw = openSecret(Buffer.from(cookie, "base64url").toString("utf8"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: string; verifier?: string; businessId?: string; exp?: number };
    if (!parsed.verifier || parsed.businessId !== businessId || !parsed.exp || parsed.exp < now.getTime()) return null;
    const a = Buffer.from(parsed.state ?? "");
    const b = Buffer.from(state);
    return a.length === b.length && timingSafeEqual(a, b) ? { verifier: parsed.verifier } : null;
  } catch {
    return null;
  }
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${jobberApiBase()}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID?.trim() ?? "",
      client_secret: process.env.JOBBER_CLIENT_SECRET?.trim() ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (res.status === 400 || res.status === 401) throw new JobberAuthError(data.error ?? `token ${res.status}`);
  if (!res.ok || !data.access_token) throw new JobberError(`token ${res.status}`);
  return data as TokenResponse;
}

function expiry(tokens: TokenResponse, now: Date) {
  return new Date(now.getTime() + (tokens.expires_in ?? 3600) * 1000);
}

export async function jobberGraphql<T>(accessToken: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${jobberApiBase()}/api/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new JobberAuthError("Jobber rejected the access token");
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: Array<{ message?: string }> } | null;
  if (!res.ok || !body) throw new JobberError(`Jobber ${res.status}`);
  if (body.errors?.length) throw new JobberError(body.errors.map((e) => e.message).join("; ").slice(0, 300));
  return body.data as T;
}

/** Code from the OAuth callback → a stored, sealed connection for this shop. */
export async function connectJobber(params: { businessId: string; code: string; verifier: string; now?: Date }) {
  const now = params.now ?? new Date();
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: jobberRedirectUri(),
    code_verifier: params.verifier,
  });
  const { account } = await jobberGraphql<{ account: { id: string; name: string | null } }>(tokens.access_token, "query { account { id name } }");
  const data = {
    accountId: account.id,
    accountName: account.name,
    accessTokenEnc: sealSecret(tokens.access_token),
    refreshTokenEnc: tokens.refresh_token ? sealSecret(tokens.refresh_token) : null,
    accessExpiresAt: expiry(tokens, now),
    refreshClaimAt: null,
    status: "active",
    lastError: null,
    connectedAt: now,
    disconnectedAt: null,
  };
  return prisma.jobberConnection.upsert({
    where: { businessId: params.businessId },
    create: { businessId: params.businessId, ...data },
    update: data,
  });
}

const WIPED = { accessTokenEnc: null, refreshTokenEnc: null, accessExpiresAt: null, refreshClaimAt: null };

async function needsReconnect(connectionId: string, reason: string) {
  await prisma.jobberConnection.update({ where: { id: connectionId }, data: { ...WIPED, status: "reconnect", lastError: reason } });
  logWarn("jobber.needs_reconnect", { connectionId, reason });
}

/**
 * A usable access token. Refreshing is claimed first: Jobber rotates refresh
 * tokens, and two workers redeeming the same one would lose the connection.
 */
export async function jobberAccessToken(businessId: string, now = new Date()): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const conn = await prisma.jobberConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== "active") return null;
    const access = openSecret(conn.accessTokenEnc);
    if (access && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - now.getTime() > REFRESH_EARLY_MS) return access;

    const refresh = openSecret(conn.refreshTokenEnc);
    if (!refresh) {
      await needsReconnect(conn.id, "No usable refresh token");
      return null;
    }
    const claimed = await prisma.jobberConnection.updateMany({
      where: {
        id: conn.id,
        refreshTokenEnc: conn.refreshTokenEnc,
        OR: [{ refreshClaimAt: null }, { refreshClaimAt: { lt: new Date(now.getTime() - REFRESH_CLAIM_MS) } }],
      },
      data: { refreshClaimAt: now },
    });
    if (!claimed.count) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    try {
      const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
      await prisma.jobberConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: sealSecret(tokens.access_token),
          // Without rotation Jobber sends no new refresh token; the old one stays valid.
          ...(tokens.refresh_token ? { refreshTokenEnc: sealSecret(tokens.refresh_token) } : {}),
          accessExpiresAt: expiry(tokens, now),
          refreshClaimAt: null,
          lastError: null,
        },
      });
      return tokens.access_token;
    } catch (error) {
      if (error instanceof JobberAuthError) {
        await needsReconnect(conn.id, "Jobber refused the refresh token");
        return null;
      }
      await prisma.jobberConnection.update({ where: { id: conn.id }, data: { refreshClaimAt: null } });
      throw error;
    }
  }
  throw new JobberError("Could not refresh the Jobber token");
}

/** Disconnect from our side: tell Jobber (best effort), then forget the tokens. */
export async function disconnectJobber(businessId: string) {
  const token = await jobberAccessToken(businessId).catch(() => null);
  if (token) {
    await jobberGraphql(token, "mutation { appDisconnect { userErrors { message } } }").catch((error) =>
      logWarn("jobber.app_disconnect_failed", { businessId, error: error instanceof Error ? error.message : String(error) }),
    );
  }
  await prisma.jobberConnection.updateMany({
    where: { businessId },
    data: { ...WIPED, status: "disconnected", disconnectedAt: new Date() },
  });
}

export function verifyJobberWebhook(rawBody: string, header: string | null) {
  const secret = process.env.JOBBER_CLIENT_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("base64"));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Jobber says the shop disconnected us (APP_DISCONNECT): the tokens are dead, forget them. */
export async function handleJobberDisconnect(accountId: string) {
  const { count } = await prisma.jobberConnection.updateMany({
    where: { accountId, status: { not: "disconnected" } },
    data: { ...WIPED, status: "disconnected", disconnectedAt: new Date(), lastError: "Disconnected in Jobber" },
  });
  return count;
}

/* ── Leads into Jobber ─────────────────────────────────────────────────── */

/** Leads that are new work. A call about an existing visit, a complaint or a question is not a Jobber request. */
const NOT_NEW_WORK = new Set(["existing_job", "follow_up", "complaint", "info_only", "not_found", "missing_business"]);

export async function enqueueJobberSync(params: { businessId: string; leadId: string; skipReason?: string | null; nonService?: boolean }) {
  if (params.nonService || (params.skipReason && NOT_NEW_WORK.has(params.skipReason))) return false;
  const conn = await prisma.jobberConnection.findUnique({ where: { businessId: params.businessId }, select: { status: true } });
  if (conn?.status !== "active") return false;
  try {
    await prisma.jobberSync.create({ data: { businessId: params.businessId, leadId: params.leadId } });
    return true;
  } catch {
    return false;
  }
}

const LOOKUP = `query($searchTerm: String!) { clientPhones(first: 5, searchTerm: $searchTerm) { nodes { number client { id } } } }`;
const CLIENT_CREATE = `mutation($input: ClientCreateInput!) { clientCreate(input: $input) { client { id } userErrors { message } } }`;
const REQUEST_CREATE = `mutation($input: RequestCreateInput!) { requestCreate(input: $input) { request { id } userErrors { message } } }`;

function splitName(name: string | null, phone: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "Caller", lastName: displayPhone(phone) ?? phone };
  if (parts.length === 1) return { firstName: parts[0], lastName: "(Orvius caller)" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

type LeadForJobber = {
  name: string | null;
  phone: string | null;
  address: string | null;
  serviceType: string | null;
  urgency: string | null;
  notes: string | null;
};

export function jobberRequestInput(lead: LeadForJobber, job: { scheduledAt: Date | null } | null, timezone: string) {
  const booked = job?.scheduledAt ? describeSlot(job.scheduledAt, timezone) : null;
  const title = [lead.serviceType?.trim() || "Service request", booked ? `booked ${booked}` : null].filter(Boolean).join(" · ").slice(0, 120);
  const instructions = [
    "From a call answered by Orvius.",
    lead.urgency ? `Urgency: ${lead.urgency}.` : null,
    lead.address ? `Address: ${lead.address}.` : null,
    lead.phone ? `Callback: ${displayPhone(lead.phone) ?? lead.phone}.` : null,
    booked ? `Orvius booked ${booked} on its schedule. Confirm it here if you schedule in Jobber.` : null,
    lead.notes?.trim() ? `Notes: ${lead.notes.trim().slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, assessment: { instructions } };
}

async function findOrCreateClient(token: string, lead: LeadForJobber, customer: { id: string; jobberClientId: string | null } | null) {
  if (customer?.jobberClientId) return customer.jobberClientId;
  const phone = normalizePhone(lead.phone ?? "");
  if (!phone) throw new JobberError("Lead has no usable phone number");
  const national = phone.replace(/\D/g, "").slice(-10);
  const found = await jobberGraphql<{ clientPhones: { nodes: Array<{ number: string; client: { id: string } | null }> } }>(token, LOOKUP, { searchTerm: national });
  let clientId = found.clientPhones.nodes.find((n) => n.client && n.number.replace(/\D/g, "").endsWith(national))?.client?.id ?? null;
  if (!clientId) {
    const created = await jobberGraphql<{ clientCreate: { client: { id: string } | null; userErrors: Array<{ message: string }> } }>(token, CLIENT_CREATE, {
      input: { ...splitName(lead.name, phone), phones: [{ number: displayPhone(phone) ?? phone, primary: true }] },
    });
    if (created.clientCreate.userErrors.length || !created.clientCreate.client) {
      throw new JobberError(`clientCreate: ${created.clientCreate.userErrors.map((e) => e.message).join("; ") || "no client"}`);
    }
    clientId = created.clientCreate.client.id;
  }
  if (customer) await prisma.customer.update({ where: { id: customer.id }, data: { jobberClientId: clientId } });
  return clientId;
}

function backoff(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts);
}

async function processSync(syncId: string, now: Date) {
  const sync = await prisma.jobberSync.findUniqueOrThrow({ where: { id: syncId } });
  if (sync.requestSentAt && !sync.jobberRequestId) {
    await prisma.jobberSync.update({
      where: { id: sync.id },
      data: { status: "check", claimedAt: null, lastError: "Sent to Jobber but the reply was lost. Check Jobber before sending again." },
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
      customer: { select: { id: true, jobberClientId: true } },
      job: { select: { scheduledAt: true } },
      business: { select: { timezone: true } },
    },
  });
  if (!lead) {
    await prisma.jobberSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "Lead no longer exists" } });
    return "skipped" as const;
  }
  const token = await jobberAccessToken(sync.businessId, now);
  if (!token) {
    await prisma.jobberSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "Jobber is not connected" } });
    return "skipped" as const;
  }

  const clientId = await findOrCreateClient(token, lead, lead.customer);
  await prisma.jobberSync.update({ where: { id: sync.id }, data: { jobberClientId: clientId, requestSentAt: new Date() } });
  const created = await jobberGraphql<{ requestCreate: { request: { id: string } | null; userErrors: Array<{ message: string }> } }>(token, REQUEST_CREATE, {
    input: { clientId, ...jobberRequestInput(lead, lead.job, lead.business?.timezone ?? "America/New_York") },
  });
  if (created.requestCreate.userErrors.length || !created.requestCreate.request) {
    // Jobber answered and refused: nothing was created, so it is safe to try again.
    await prisma.jobberSync.update({ where: { id: sync.id }, data: { requestSentAt: null } });
    throw new JobberError(`requestCreate: ${created.requestCreate.userErrors.map((e) => e.message).join("; ") || "no request"}`);
  }
  await prisma.jobberSync.update({
    where: { id: sync.id },
    data: { status: "done", claimedAt: null, jobberRequestId: created.requestCreate.request.id, lastError: null },
  });
  logInfo("jobber.request_created", { businessId: sync.businessId, leadId: sync.leadId });
  return "done" as const;
}

/** Send what is due. Each row is claimed first, so overlapping runs never send the same lead. */
export async function drainJobberSyncs(options: { limit?: number; now?: Date; businessId?: string; budgetMs?: number } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 45_000);
  const due = await prisma.jobberSync.findMany({
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
    const claimed = await prisma.jobberSync.updateMany({
      where: { id: row.id, status: "pending", claimedAt: row.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      tally[await processSync(row.id, now)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_SYNC_ATTEMPTS;
      await prisma.jobberSync.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "failed" : "pending",
          claimedAt: null,
          lastError: message.slice(0, 300),
          nextAttemptAt: new Date(now.getTime() + backoff(attempts)),
        },
      });
      tally[giveUp ? "failed" : "retry"] += 1;
      (giveUp ? logError : logWarn)("jobber.sync_failed", { businessId: row.businessId, syncId: row.id, attempts, error: message });
    }
  }
  return tally;
}

/** What Settings shows. */
export async function jobberStatus(businessId: string) {
  const [conn, recent, failing] = await Promise.all([
    prisma.jobberConnection.findUnique({ where: { businessId }, select: { status: true, accountName: true, connectedAt: true, lastError: true } }),
    prisma.jobberSync.count({ where: { businessId, status: "done", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.jobberSync.count({ where: { businessId, status: { in: ["failed", "check"] } } }),
  ]);
  return {
    available: jobberConfigured(),
    status: conn?.status ?? "none",
    accountName: conn?.accountName ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
    lastError: conn?.status === "reconnect" ? conn.lastError : null,
    sentLast30Days: recent,
    needsAttention: failing,
  };
}
