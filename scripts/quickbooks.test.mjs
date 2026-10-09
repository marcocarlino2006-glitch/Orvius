#!/usr/bin/env node
/*
 * QuickBooks: a shop connects once, and every payment it collects afterwards
 * lands in QuickBooks Online as a sales receipt against the right customer.
 * Never twice, never for money from before the connection, never with tokens
 * readable from a database copy, and never by losing the connection to a race.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { sealOAuthState, openOAuthState } from "../src/lib/jobber.ts";
import {
  MAX_QB_SYNC_ATTEMPTS,
  QUICKBOOKS_ITEM_NAME,
  connectQuickBooks,
  customerDisplayName,
  disconnectQuickBooks,
  drainQuickBooksSyncs,
  qboLiteral,
  quickbooksAccess,
  quickbooksAuthorizeUrl,
  quickbooksStatus,
  receiptLines,
  txnDate,
} from "../src/lib/quickbooks.ts";
import { openSecret } from "../src/lib/secret-box.ts";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
process.env.QUICKBOOKS_CLIENT_ID = "qb-client";
process.env.QUICKBOOKS_CLIENT_SECRET = "qb-secret";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const made = [];

/* ── A fake Intuit: OAuth token + revoke endpoints and the accounting API ── */
const fake = {};
function resetFake() {
  Object.assign(fake, {
    seq: 0,
    refreshCalls: 0,
    refuseRefresh: false,
    revoked: [],
    customers: [],
    takenNames: [],
    items: [],
    receipts: [],
    receiptRequestIds: new Map(),
    failReceipts: 0,
    incomeAccounts: [{ Id: "79", Name: "Sales of Product Income" }, { Id: "80", Name: "Services" }],
  });
}
resetFake();
const liveTokens = new Set();

const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url, "http://fake");
  if (url.pathname === "/oauth2/v1/tokens/bearer") {
    assert.equal(req.headers.authorization, `Basic ${Buffer.from("qb-client:qb-secret").toString("base64")}`);
    const form = new URLSearchParams(raw);
    if (form.get("grant_type") === "refresh_token") {
      fake.refreshCalls += 1;
      if (fake.refuseRefresh) return send(400, { error: "invalid_grant" });
    } else if (form.get("code") !== "good-code") {
      return send(400, { error: "invalid_grant" });
    }
    const access = `at-${++fake.seq}`;
    liveTokens.add(access);
    return send(200, { access_token: access, refresh_token: `rt-${fake.seq}`, expires_in: 3600 });
  }
  if (url.pathname === "/v2/oauth2/tokens/revoke") {
    fake.revoked.push(JSON.parse(raw).token);
    return send(200, {});
  }
  const m = url.pathname.match(/^\/v3\/company\/([^/]+)\/(.+)$/);
  if (!m) return send(404, {});
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!liveTokens.has(token)) return send(401, { Fault: { Error: [{ Message: "AuthenticationFailed" }] } });
  assert.equal(url.searchParams.get("minorversion"), "75");
  const [, realm, path] = m;
  assert.equal(realm, "realm-1");
  if (path.startsWith("companyinfo/")) return send(200, { CompanyInfo: { CompanyName: "Cole Heating LLC" } });
  if (path === "query") {
    const q = url.searchParams.get("query");
    const name = q.match(/= '((?:[^'\\]|\\.)*)'/)?.[1]?.replace(/\\'/g, "'");
    if (q.includes("from Customer")) {
      const hit = fake.customers.find((c) => c.DisplayName === name);
      return send(200, { QueryResponse: hit ? { Customer: [{ Id: hit.Id }] } : {} });
    }
    if (q.includes("from Item")) {
      const hit = fake.items.find((i) => i.Name === name);
      return send(200, { QueryResponse: hit ? { Item: [{ Id: hit.Id }] } : {} });
    }
    if (q.includes("from Account")) return send(200, { QueryResponse: { Account: fake.incomeAccounts } });
  }
  const body = raw ? JSON.parse(raw) : null;
  if (path === "customer") {
    if (fake.takenNames.includes(body.DisplayName)) {
      return send(400, { Fault: { Error: [{ Message: "Duplicate Name Exists Error", code: "6240" }] } });
    }
    const c = { Id: `c-${++fake.seq}`, ...body };
    fake.customers.push(c);
    return send(200, { Customer: c });
  }
  if (path === "item") {
    const i = { Id: `i-${++fake.seq}`, ...body };
    fake.items.push(i);
    return send(200, { Item: i });
  }
  if (path === "salesreceipt") {
    const requestId = url.searchParams.get("requestid");
    assert.ok(requestId, "every receipt carries a requestid");
    if (fake.receiptRequestIds.has(requestId)) return send(200, { SalesReceipt: fake.receiptRequestIds.get(requestId) });
    const r = { Id: `sr-${++fake.seq}`, ...body };
    fake.receipts.push(r);
    fake.receiptRequestIds.set(requestId, r);
    // Intuit saved it, but the reply never makes it back.
    if (fake.failReceipts > 0) {
      fake.failReceipts -= 1;
      return send(503, {});
    }
    return send(200, { SalesReceipt: r });
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.QUICKBOOKS_API_BASE = base;
  process.env.QUICKBOOKS_OAUTH_BASE = base;
});
test.after(async () => {
  server.close();
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.quickBooksSync.deleteMany({ where: { businessId: { in: made } } });
  await prisma.$disconnect();
});
test.beforeEach(() => resetFake());

async function connectedShop() {
  const shop = await prisma.business.create({
    data: { name: "Cole Heating", slug: `qb-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  made.push(shop.id);
  const { state, cookie } = sealOAuthState(shop.id);
  assert.ok(openOAuthState(cookie, state, shop.id));
  await connectQuickBooks({ businessId: shop.id, code: "good-code", realmId: "realm-1" });
  return shop;
}

async function paidInvoice(shop, { amountCents = 45000, items = [], paidAt = new Date(), method = "stripe:cs_1", name = "Ann Cole" } = {}) {
  const phone = randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name, phone, phoneNormalized: phone, email: "ann@example.test" } });
  const job = await prisma.job.create({ data: { businessId: shop.id, customerId: customer.id, title: "AC repair", status: "completed" } });
  for (const [i, item] of items.entries()) {
    await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: job.id, name: item.name, quantity: item.quantity, unitCents: item.unitCents, position: i } });
  }
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents, status: "paid", paidAt } });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents, status: "recorded", method } });
  return { customer, job, invoice };
}

test("the authorize link asks only for accounting access and comes back to Orvius", () => {
  const url = new URL(quickbooksAuthorizeUrl("st-1"));
  assert.equal(url.pathname, "/connect/oauth2");
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(url.searchParams.get("state"), "st-1");
  assert.match(url.searchParams.get("redirect_uri"), /\/api\/integrations\/quickbooks\/callback$/);
});

test("connecting stores sealed tokens and the company name, never the tokens in the clear", async () => {
  const shop = await connectedShop();
  const conn = await prisma.quickBooksConnection.findUnique({ where: { businessId: shop.id } });
  assert.equal(conn.companyName, "Cole Heating LLC");
  assert.equal(conn.status, "active");
  assert.doesNotMatch(conn.accessTokenEnc, /^at-/);
  assert.match(openSecret(conn.accessTokenEnc), /^at-/);
  assert.match(openSecret(conn.refreshTokenEnc), /^rt-/);
  await assert.rejects(connectQuickBooks({ businessId: shop.id, code: "bad-code", realmId: "realm-1" }));
});

test("a paid invoice becomes one sales receipt, with its line items, the customer, and the shop's date", async () => {
  const shop = await connectedShop();
  const paidAt = new Date("2026-10-09T03:30:00Z");
  const { customer, invoice } = await paidInvoice(shop, {
    amountCents: 45000,
    paidAt: new Date(Math.max(paidAt.getTime(), Date.now())),
    items: [
      { name: "Diagnostic", quantity: 1, unitCents: 9000 },
      { name: "Capacitor", quantity: 2, unitCents: 18000 },
    ],
  });

  const first = await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(first.done, 1);
  assert.equal(fake.receipts.length, 1);
  const r = fake.receipts[0];
  assert.deepEqual(
    r.Line.map((l) => [l.Description, l.Amount, l.SalesItemLineDetail.Qty, l.SalesItemLineDetail.UnitPrice]),
    [
      ["Diagnostic", 90, 1, 90],
      ["Capacitor", 360, 2, 180],
    ],
  );
  assert.match(r.PrivateNote, new RegExp(`Orvius invoice ${invoice.id}, paid by card through Stripe`));
  assert.equal(fake.customers.length, 1);
  assert.equal(fake.customers[0].DisplayName, "Ann Cole");
  assert.equal(fake.customers[0].PrimaryEmailAddr.Address, "ann@example.test");
  assert.equal(r.CustomerRef.value, fake.customers[0].Id);
  assert.equal(fake.items.length, 1);
  assert.equal(fake.items[0].Name, QUICKBOOKS_ITEM_NAME);
  assert.equal(fake.items[0].IncomeAccountRef.value, "80", "books to the services income account");
  assert.equal((await prisma.customer.findUnique({ where: { id: customer.id } })).quickbooksCustomerId, fake.customers[0].Id);

  const second = await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(second.done, 0);
  assert.equal(fake.receipts.length, 1, "never sent twice");

  const status = await quickbooksStatus(shop.id);
  assert.equal(status.sentLast30Days, 1);
  assert.equal(status.companyName, "Cole Heating LLC");
});

test("money from before the connection is not sent, deposits are, and a mismatched total books as one line", async () => {
  const shop = await connectedShop();
  await paidInvoice(shop, { paidAt: new Date(Date.now() - 7 * 86_400_000) });
  const { job } = await paidInvoice(shop, { amountCents: 30000, items: [{ name: "Full system", quantity: 1, unitCents: 40000 }], method: "cash" });
  await prisma.deposit.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 10000, status: "paid", paidAt: new Date() } });

  const tally = await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(tally.done, 2);
  const lines = fake.receipts.map((r) => r.Line.map((l) => [l.Description, l.Amount]));
  assert.deepEqual(lines.sort(), [[["AC repair", 300]], [["Deposit for AC repair", 100]]].sort());
  assert.ok(fake.receipts.some((r) => /paid by cash, recorded in Orvius/.test(r.PrivateNote)));
});

test("a lost reply is retried under the same requestid, so QuickBooks keeps one receipt", async () => {
  const shop = await connectedShop();
  await paidInvoice(shop);
  fake.failReceipts = 1;
  const first = await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(first.retry, 1);
  const row = await prisma.quickBooksSync.findFirst({ where: { businessId: shop.id } });
  await prisma.quickBooksSync.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
  const second = await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(second.done, 1);
  assert.equal(fake.receipts.length, 1);
  assert.equal(fake.customers.length, 1, "the customer is not created twice either");
});

test("after the last attempt a payment is marked failed and Settings counts it", async () => {
  const shop = await connectedShop();
  await paidInvoice(shop);
  fake.incomeAccounts = [];
  for (let i = 0; i < MAX_QB_SYNC_ATTEMPTS; i++) {
    await drainQuickBooksSyncs({ businessId: shop.id });
    await prisma.quickBooksSync.updateMany({ where: { businessId: shop.id }, data: { nextAttemptAt: new Date(0) } });
  }
  const row = await prisma.quickBooksSync.findFirst({ where: { businessId: shop.id } });
  assert.equal(row.status, "failed");
  assert.match(row.lastError, /no income account/);
  assert.equal((await quickbooksStatus(shop.id)).needsAttention, 1);
});

test("a name QuickBooks already uses for a vendor still gets a customer", async () => {
  const shop = await connectedShop();
  fake.takenNames.push("Ann Cole");
  await paidInvoice(shop);
  await drainQuickBooksSyncs({ businessId: shop.id });
  assert.equal(fake.customers[0].DisplayName, "Ann Cole (customer)");
  assert.equal(fake.receipts.length, 1);
});

test("tokens refresh and rotate; a refused refresh asks the owner to reconnect and forgets the tokens", async () => {
  const shop = await connectedShop();
  await prisma.quickBooksConnection.update({ where: { businessId: shop.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
  const access = await quickbooksAccess(shop.id);
  assert.ok(access);
  assert.equal(fake.refreshCalls, 1);
  const conn = await prisma.quickBooksConnection.findUnique({ where: { businessId: shop.id } });
  assert.equal(openSecret(conn.refreshTokenEnc), `rt-${fake.seq}`);

  await prisma.quickBooksConnection.update({ where: { businessId: shop.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
  fake.refuseRefresh = true;
  assert.equal(await quickbooksAccess(shop.id), null);
  const dead = await prisma.quickBooksConnection.findUnique({ where: { businessId: shop.id } });
  assert.equal(dead.status, "reconnect");
  assert.equal(dead.accessTokenEnc, null);
  assert.equal(dead.refreshTokenEnc, null);
});

test("disconnecting revokes at Intuit and forgets the tokens", async () => {
  const shop = await connectedShop();
  await disconnectQuickBooks(shop.id);
  assert.equal(fake.revoked.length, 1);
  assert.match(fake.revoked[0], /^rt-/);
  const conn = await prisma.quickBooksConnection.findUnique({ where: { businessId: shop.id } });
  assert.equal(conn.status, "disconnected");
  assert.equal(conn.refreshTokenEnc, null);
  await paidInvoice(shop);
  assert.equal((await drainQuickBooksSyncs({ businessId: shop.id })).done, 0);
});

test("pure helpers: quoting, names, dates, lines", () => {
  assert.equal(qboLiteral("O'Brien"), "'O\\'Brien'");
  assert.equal(customerDisplayName({ name: null, phone: "+15125550142" }), "Caller +1 512 555 0142");
  assert.equal(customerDisplayName({ name: null, phone: null }), "Orvius customer");
  assert.equal(txnDate(new Date("2026-10-09T03:30:00Z"), "America/Chicago"), "2026-10-08");
  assert.deepEqual(receiptLines([], 500, "Repair"), [{ description: "Repair", amountCents: 500 }]);
});

test("only owners and managers connect it, and both sweeps send", () => {
  for (const p of ["connect", "callback", "disconnect"]) {
    assert.match(read(`src/app/api/integrations/quickbooks/${p}/route.ts`), /requirePermission\("settings\.edit"/);
  }
  assert.match(read("src/lib/line-watch-sweep.ts"), /drainQuickBooksSyncs\(/);
  assert.match(read("src/app/api/cron/notifications/route.ts"), /drainQuickBooksSyncs\(/);
  assert.match(read("src/components/settings-center/sections/integrations-section.tsx"), /quickbooksRow\(/);
  assert.match(read("prisma/turso-migrate.sql"), /CREATE TABLE IF NOT EXISTS "QuickBooksSync"/);
});
