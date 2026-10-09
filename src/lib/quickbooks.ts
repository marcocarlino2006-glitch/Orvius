import { displayPhone } from "@/lib/customer";
import { getAppUrl } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret, secretBoxConfigured } from "@/lib/secret-box";

/**
 * QuickBooks Online: every payment Orvius collects (a paid invoice, a paid
 * deposit, by card or recorded by hand) lands in the shop's QuickBooks as a
 * sales receipt against the matched or created customer. That is the half of
 * bookkeeping a shop does twice today: once in the field, once at night.
 *
 * Only payments collected after the shop connects are sent, so nothing the
 * bookkeeper already entered is duplicated. Each receipt is created with
 * Intuit's `requestid`, which Intuit dedupes, so a retry after a lost reply
 * returns the first receipt instead of making a second one.
 */

export const QBO_MINOR_VERSION = "75";
export const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";
export const QUICKBOOKS_OAUTH_COOKIE = "orvius_quickbooks_oauth";
export const QUICKBOOKS_ITEM_NAME = "Services (Orvius)";
export const MAX_QB_SYNC_ATTEMPTS = 6;
const REFRESH_EARLY_MS = 5 * 60_000;
const REFRESH_CLAIM_MS = 30_000;
const CLAIM_STALE_MS = 5 * 60_000;

export class QuickBooksAuthError extends Error {}
export class QuickBooksError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

/* Tests point these at a fake Intuit; production always talks to Intuit. */
function override(name: string) {
  const value = process.env[name]?.trim();
  return value && process.env.NODE_ENV !== "production" ? value.replace(/\/$/, "") : null;
}

export function quickbooksApiBase() {
  return (
    override("QUICKBOOKS_API_BASE") ??
    (process.env.QUICKBOOKS_ENVIRONMENT?.trim() === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com")
  );
}

const authorizeBase = () => override("QUICKBOOKS_OAUTH_BASE") ?? "https://appcenter.intuit.com";
const tokenUrl = () => `${override("QUICKBOOKS_OAUTH_BASE") ?? "https://oauth.platform.intuit.com"}/oauth2/v1/tokens/bearer`;
const revokeUrl = () => `${override("QUICKBOOKS_OAUTH_BASE") ?? "https://developer.api.intuit.com"}/v2/oauth2/tokens/revoke`;

export function quickbooksConfigured() {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID?.trim() && process.env.QUICKBOOKS_CLIENT_SECRET?.trim() && secretBoxConfigured());
}

export function quickbooksRedirectUri() {
  return `${getAppUrl().replace(/\/$/, "")}/api/integrations/quickbooks/callback`;
}

export function quickbooksAuthorizeUrl(state: string) {
  const url = new URL(`${authorizeBase()}/connect/oauth2`);
  url.searchParams.set("client_id", process.env.QUICKBOOKS_CLIENT_ID?.trim() ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QUICKBOOKS_SCOPE);
  url.searchParams.set("redirect_uri", quickbooksRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

const basicAuth = () =>
  `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID?.trim() ?? ""}:${process.env.QUICKBOOKS_CLIENT_SECRET?.trim() ?? ""}`).toString("base64")}`;

type TokenResponse = { access_token: string; refresh_token: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { Authorization: basicAuth(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (res.status === 400 || res.status === 401) throw new QuickBooksAuthError(data.error ?? `token ${res.status}`);
  if (!res.ok || !data.access_token || !data.refresh_token) throw new QuickBooksError(`token ${res.status}`);
  return data as TokenResponse;
}

const expiry = (tokens: TokenResponse, now: Date) => new Date(now.getTime() + (tokens.expires_in ?? 3600) * 1000);

type Fault = { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }> } };

export async function qboRequest<T>(
  token: string,
  realmId: string,
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${quickbooksApiBase()}/v3/company/${encodeURIComponent(realmId)}/${path}`);
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new QuickBooksAuthError("QuickBooks rejected the access token");
  const data = (await res.json().catch(() => null)) as (T & Fault) | null;
  const fault = data?.Fault?.Error?.[0];
  if (!res.ok || !data || fault) {
    throw new QuickBooksError(
      `QuickBooks ${res.status}: ${fault?.Message ?? "no body"}${fault?.Detail ? ` (${fault.Detail})` : ""}`.slice(0, 300),
      fault?.code ?? null,
    );
  }
  return data;
}

/** A QuickBooks query string literal. Intuit escapes a quote with a backslash. */
export function qboLiteral(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

async function qboQuery<T>(token: string, realmId: string, sql: string): Promise<T> {
  return qboRequest<T>(token, realmId, "query", { query: { query: sql } });
}

/** Code and realm from the OAuth callback → a stored, sealed connection for this shop. */
export async function connectQuickBooks(params: { businessId: string; code: string; realmId: string; now?: Date }) {
  const now = params.now ?? new Date();
  const tokens = await tokenRequest({ grant_type: "authorization_code", code: params.code, redirect_uri: quickbooksRedirectUri() });
  const info = await qboRequest<{ CompanyInfo?: { CompanyName?: string } }>(
    tokens.access_token,
    params.realmId,
    `companyinfo/${encodeURIComponent(params.realmId)}`,
  ).catch(() => null);
  const data = {
    realmId: params.realmId,
    companyName: info?.CompanyInfo?.CompanyName ?? null,
    accessTokenEnc: sealSecret(tokens.access_token),
    refreshTokenEnc: sealSecret(tokens.refresh_token),
    accessExpiresAt: expiry(tokens, now),
    refreshClaimAt: null,
    status: "active",
    lastError: null,
    connectedAt: now,
    disconnectedAt: null,
  };
  const existing = await prisma.quickBooksConnection.findUnique({ where: { businessId: params.businessId }, select: { realmId: true } });
  return prisma.quickBooksConnection.upsert({
    where: { businessId: params.businessId },
    create: { businessId: params.businessId, ...data },
    // A different company keeps none of the old one's ids.
    update: { ...data, ...(existing && existing.realmId !== params.realmId ? { itemId: null } : {}) },
  });
}

const WIPED = { accessTokenEnc: null, refreshTokenEnc: null, accessExpiresAt: null, refreshClaimAt: null };

async function needsReconnect(connectionId: string, reason: string) {
  await prisma.quickBooksConnection.update({ where: { id: connectionId }, data: { ...WIPED, status: "reconnect", lastError: reason } });
  logWarn("quickbooks.needs_reconnect", { connectionId, reason });
}

/** A usable access token and realm. Refreshing is claimed first: Intuit rotates refresh tokens. */
export async function quickbooksAccess(businessId: string, now = new Date()): Promise<{ token: string; realmId: string; connectionId: string } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const conn = await prisma.quickBooksConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== "active") return null;
    const access = openSecret(conn.accessTokenEnc);
    if (access && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - now.getTime() > REFRESH_EARLY_MS) {
      return { token: access, realmId: conn.realmId, connectionId: conn.id };
    }
    const refresh = openSecret(conn.refreshTokenEnc);
    if (!refresh) {
      await needsReconnect(conn.id, "No usable refresh token");
      return null;
    }
    const claimed = await prisma.quickBooksConnection.updateMany({
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
      await prisma.quickBooksConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: sealSecret(tokens.access_token),
          refreshTokenEnc: sealSecret(tokens.refresh_token),
          accessExpiresAt: expiry(tokens, now),
          refreshClaimAt: null,
          lastError: null,
        },
      });
      return { token: tokens.access_token, realmId: conn.realmId, connectionId: conn.id };
    } catch (error) {
      if (error instanceof QuickBooksAuthError) {
        await needsReconnect(conn.id, "QuickBooks refused the refresh token");
        return null;
      }
      await prisma.quickBooksConnection.update({ where: { id: conn.id }, data: { refreshClaimAt: null } });
      throw error;
    }
  }
  throw new QuickBooksError("Could not refresh the QuickBooks token");
}

/** Disconnect from our side: revoke at Intuit (best effort), then forget the tokens. */
export async function disconnectQuickBooks(businessId: string) {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { businessId } });
  const refresh = openSecret(conn?.refreshTokenEnc ?? null);
  if (refresh) {
    await fetch(revokeUrl(), {
      method: "POST",
      headers: { Authorization: basicAuth(), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token: refresh }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => logWarn("quickbooks.revoke_failed", { businessId, error: error instanceof Error ? error.message : String(error) }));
  }
  await prisma.quickBooksConnection.updateMany({ where: { businessId }, data: { ...WIPED, status: "disconnected", disconnectedAt: new Date() } });
}

/* ── Payments into QuickBooks ──────────────────────────────────────────── */

/**
 * Every payment collected since the shop connected that has no sync row yet.
 * Reading the payments rather than hooking each place that marks one paid
 * means a new payment path cannot be forgotten.
 */
export async function enqueueQuickBooksPayments(businessId: string, since: Date, now = new Date()) {
  const [invoices, deposits, existing] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId, status: "paid", paidAt: { gte: since } }, select: { id: true, amountCents: true }, take: 200 }),
    prisma.deposit.findMany({ where: { businessId, status: "paid", paidAt: { gte: since } }, select: { id: true, amountCents: true }, take: 200 }),
    prisma.quickBooksSync.findMany({ where: { businessId, createdAt: { gte: new Date(since.getTime() - 60_000) } }, select: { sourceType: true, sourceId: true } }),
  ]);
  const have = new Set(existing.map((r) => `${r.sourceType}:${r.sourceId}`));
  let added = 0;
  for (const [sourceType, rows] of [["invoice", invoices], ["deposit", deposits]] as const) {
    for (const row of rows) {
      if (have.has(`${sourceType}:${row.id}`) || row.amountCents <= 0) continue;
      try {
        await prisma.quickBooksSync.create({ data: { businessId, sourceType, sourceId: row.id, amountCents: row.amountCents, nextAttemptAt: now } });
        added += 1;
      } catch {
        /* Another sweep enqueued it first. */
      }
    }
  }
  return added;
}

type ReceiptLine = { description: string; amountCents: number; quantity?: number; unitCents?: number };
type ReceiptPayer = { id: string | null; name: string | null; phone: string | null; email: string | null; address: string | null; quickbooksCustomerId: string | null };
type Receipt = { payer: ReceiptPayer; lines: ReceiptLine[]; paidAt: Date; note: string };

const dollars = (cents: number) => Math.round(cents) / 100;

/** The day the money came in, on the shop's calendar. */
export function txnDate(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function salesReceiptBody(receipt: Receipt, refs: { customerId: string; itemId: string }, timezone: string) {
  return {
    CustomerRef: { value: refs.customerId },
    TxnDate: txnDate(receipt.paidAt, timezone),
    PrivateNote: receipt.note.slice(0, 4000),
    Line: receipt.lines.map((line) => ({
      DetailType: "SalesItemLineDetail",
      Amount: dollars(line.amountCents),
      Description: line.description.slice(0, 4000),
      SalesItemLineDetail: {
        ItemRef: { value: refs.itemId },
        ...(line.quantity && line.unitCents != null ? { Qty: line.quantity, UnitPrice: dollars(line.unitCents) } : {}),
      },
    })),
  };
}

function methodLabel(method: string | null | undefined) {
  if (!method) return "recorded in Orvius";
  if (method.startsWith("stripe:")) return "paid by card through Stripe";
  return `paid by ${method.replace(/_/g, " ")}, recorded in Orvius`;
}

/** Line items when they add up to what was paid; otherwise one line, so the receipt always equals the money. */
export function receiptLines(
  items: Array<{ name: string; quantity: number; unitCents: number }>,
  paidCents: number,
  fallback: string,
): ReceiptLine[] {
  const lines = items.map((i) => ({ description: i.name, quantity: i.quantity, unitCents: i.unitCents, amountCents: Math.round(i.quantity * i.unitCents) }));
  const total = lines.reduce((sum, l) => sum + l.amountCents, 0);
  return lines.length && total === paidCents ? lines : [{ description: fallback, amountCents: paidCents }];
}

async function loadReceipt(sync: { sourceType: string; sourceId: string; amountCents: number }): Promise<Receipt | null> {
  const customerSelect = { id: true, name: true, phone: true, email: true, address: true, quickbooksCustomerId: true } as const;
  if (sync.sourceType === "invoice") {
    const invoice = await prisma.invoice.findUnique({
      where: { id: sync.sourceId },
      select: {
        id: true,
        status: true,
        paidAt: true,
        payments: { select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
        job: {
          select: {
            title: true,
            customer: { select: customerSelect },
            lineItems: { select: { name: true, quantity: true, unitCents: true }, orderBy: { position: "asc" } },
          },
        },
      },
    });
    if (!invoice || invoice.status !== "paid") return null;
    const title = invoice.job?.title?.trim() || "Service";
    return {
      payer: invoice.job?.customer ?? { id: null, name: null, phone: null, email: null, address: null, quickbooksCustomerId: null },
      lines: receiptLines(invoice.job?.lineItems ?? [], sync.amountCents, title),
      paidAt: invoice.paidAt ?? new Date(),
      note: `Orvius invoice ${invoice.id}, ${methodLabel(invoice.payments[0]?.method)}.`,
    };
  }
  const deposit = await prisma.deposit.findUnique({
    where: { id: sync.sourceId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      lead: { select: { name: true, phone: true, serviceType: true, address: true, customer: { select: customerSelect } } },
      job: { select: { title: true, customer: { select: customerSelect } } },
    },
  });
  if (!deposit || deposit.status !== "paid") return null;
  const customer = deposit.job?.customer ?? deposit.lead?.customer ?? null;
  const what = deposit.job?.title?.trim() || deposit.lead?.serviceType?.trim() || "service";
  return {
    payer: customer ?? {
      id: null,
      name: deposit.lead?.name ?? null,
      phone: deposit.lead?.phone ?? null,
      email: null,
      address: deposit.lead?.address ?? null,
      quickbooksCustomerId: null,
    },
    lines: [{ description: `Deposit for ${what}`, amountCents: sync.amountCents }],
    paidAt: deposit.paidAt ?? new Date(),
    note: `Orvius booking deposit ${deposit.id}, paid by card through Stripe.`,
  };
}

export function customerDisplayName(payer: Pick<ReceiptPayer, "name" | "phone">) {
  const name = payer.name?.trim();
  if (name) return name.slice(0, 100);
  const phone = payer.phone ? (displayPhone(payer.phone) ?? payer.phone) : null;
  return phone ? `Caller ${phone}` : "Orvius customer";
}

async function findOrCreateCustomer(access: { token: string; realmId: string }, payer: ReceiptPayer) {
  if (payer.quickbooksCustomerId) return payer.quickbooksCustomerId;
  const displayName = customerDisplayName(payer);
  const found = await qboQuery<{ QueryResponse?: { Customer?: Array<{ Id: string }> } }>(
    access.token,
    access.realmId,
    `select Id from Customer where DisplayName = ${qboLiteral(displayName)}`,
  );
  let id = found.QueryResponse?.Customer?.[0]?.Id ?? null;
  if (!id) {
    const body = {
      DisplayName: displayName,
      ...(payer.phone ? { PrimaryPhone: { FreeFormNumber: displayPhone(payer.phone) ?? payer.phone } } : {}),
      ...(payer.email ? { PrimaryEmailAddr: { Address: payer.email } } : {}),
      ...(payer.address ? { BillAddr: { Line1: payer.address.slice(0, 500) } } : {}),
    };
    try {
      id = (await qboRequest<{ Customer: { Id: string } }>(access.token, access.realmId, "customer", { method: "POST", body })).Customer.Id;
    } catch (error) {
      // 6240: the name is taken by a vendor or employee, which a customer query cannot see.
      if (!(error instanceof QuickBooksError) || error.code !== "6240") throw error;
      id = (
        await qboRequest<{ Customer: { Id: string } }>(access.token, access.realmId, "customer", {
          method: "POST",
          body: { ...body, DisplayName: `${displayName} (customer)`.slice(0, 100) },
        })
      ).Customer.Id;
    }
  }
  if (payer.id) await prisma.customer.update({ where: { id: payer.id }, data: { quickbooksCustomerId: id } });
  return id;
}

async function serviceItemId(access: { token: string; realmId: string; connectionId: string }) {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { id: access.connectionId }, select: { itemId: true } });
  if (conn?.itemId) return conn.itemId;
  const found = await qboQuery<{ QueryResponse?: { Item?: Array<{ Id: string }> } }>(
    access.token,
    access.realmId,
    `select Id from Item where Name = ${qboLiteral(QUICKBOOKS_ITEM_NAME)}`,
  );
  let id = found.QueryResponse?.Item?.[0]?.Id ?? null;
  if (!id) {
    const accounts = await qboQuery<{ QueryResponse?: { Account?: Array<{ Id: string; Name?: string }> } }>(
      access.token,
      access.realmId,
      "select Id, Name from Account where AccountType = 'Income' and Active = true",
    );
    const income = accounts.QueryResponse?.Account ?? [];
    const account = income.find((a) => /service/i.test(a.Name ?? "")) ?? income.find((a) => /sales/i.test(a.Name ?? "")) ?? income[0];
    if (!account) throw new QuickBooksError("This QuickBooks company has no income account to book sales to");
    id = (
      await qboRequest<{ Item: { Id: string } }>(access.token, access.realmId, "item", {
        method: "POST",
        body: { Name: QUICKBOOKS_ITEM_NAME, Type: "Service", IncomeAccountRef: { value: account.Id } },
      })
    ).Item.Id;
  }
  await prisma.quickBooksConnection.update({ where: { id: access.connectionId }, data: { itemId: id } });
  return id;
}

const backoff = (attempts: number) => Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts);

async function processSync(syncId: string, now: Date) {
  const sync = await prisma.quickBooksSync.findUniqueOrThrow({ where: { id: syncId } });
  const receipt = await loadReceipt(sync);
  if (!receipt) {
    await prisma.quickBooksSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "No longer a paid payment in Orvius" } });
    return "skipped" as const;
  }
  const access = await quickbooksAccess(sync.businessId, now);
  if (!access) {
    await prisma.quickBooksSync.update({ where: { id: sync.id }, data: { status: "skipped", claimedAt: null, lastError: "QuickBooks is not connected" } });
    return "skipped" as const;
  }
  const shop = await prisma.business.findUnique({ where: { id: sync.businessId }, select: { timezone: true } });
  const customerId = sync.qbCustomerId ?? (await findOrCreateCustomer(access, receipt.payer));
  if (!sync.qbCustomerId) await prisma.quickBooksSync.update({ where: { id: sync.id }, data: { qbCustomerId: customerId } });
  const itemId = await serviceItemId(access);
  const created = await qboRequest<{ SalesReceipt: { Id: string } }>(access.token, access.realmId, "salesreceipt", {
    method: "POST",
    body: salesReceiptBody(receipt, { customerId, itemId }, shop?.timezone ?? "America/New_York"),
    query: { requestid: sync.id },
  });
  await prisma.quickBooksSync.update({
    where: { id: sync.id },
    data: { status: "done", claimedAt: null, qbReceiptId: created.SalesReceipt.Id, lastError: null },
  });
  logInfo("quickbooks.receipt_created", { businessId: sync.businessId, sourceType: sync.sourceType });
  return "done" as const;
}

/** Enqueue new payments for every connected shop, then send what is due. Rows are claimed first, so overlapping runs never send one twice. */
export async function drainQuickBooksSyncs(options: { limit?: number; now?: Date; businessId?: string; budgetMs?: number } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 45_000);
  const connections = await prisma.quickBooksConnection.findMany({
    where: { status: "active", ...(options.businessId ? { businessId: options.businessId } : {}) },
    select: { businessId: true, connectedAt: true },
    take: 500,
  });
  for (const conn of connections) {
    if (Date.now() > stopAt) break;
    await enqueueQuickBooksPayments(conn.businessId, conn.connectedAt, now).catch((error) =>
      logWarn("quickbooks.enqueue_failed", { businessId: conn.businessId, error: error instanceof Error ? error.message : String(error) }),
    );
  }
  const due = await prisma.quickBooksSync.findMany({
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
  const tally = { done: 0, skipped: 0, retry: 0, failed: 0 };
  for (const row of due) {
    if (Date.now() > stopAt) break;
    const claimed = await prisma.quickBooksSync.updateMany({
      where: { id: row.id, status: "pending", claimedAt: row.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      tally[await processSync(row.id, now)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_QB_SYNC_ATTEMPTS;
      await prisma.quickBooksSync.update({
        where: { id: row.id },
        data: { status: giveUp ? "failed" : "pending", claimedAt: null, lastError: message.slice(0, 300), nextAttemptAt: new Date(now.getTime() + backoff(attempts)) },
      });
      tally[giveUp ? "failed" : "retry"] += 1;
      (giveUp ? logError : logWarn)("quickbooks.sync_failed", { businessId: row.businessId, syncId: row.id, attempts, error: message });
    }
  }
  return tally;
}

/** What Settings shows. */
export async function quickbooksStatus(businessId: string) {
  const [conn, recent, failing] = await Promise.all([
    prisma.quickBooksConnection.findUnique({ where: { businessId }, select: { status: true, companyName: true, connectedAt: true, lastError: true } }),
    prisma.quickBooksSync.count({ where: { businessId, status: "done", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.quickBooksSync.count({ where: { businessId, status: "failed" } }),
  ]);
  return {
    available: quickbooksConfigured(),
    status: conn?.status ?? "none",
    companyName: conn?.companyName ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
    lastError: conn?.status === "reconnect" ? conn.lastError : null,
    sentLast30Days: recent,
    needsAttention: failing,
  };
}
