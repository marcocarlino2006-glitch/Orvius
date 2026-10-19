#!/usr/bin/env node
/*
 * Record authority in the real sync callers: Jobber, Housecall Pro and
 * QuickBooks only receive a part of the record when the shop's contract, read
 * at send time, makes them its record of truth or an authorized copy. Several
 * connections at once, a contract changed between queueing and sending, and
 * one system failing while another succeeds.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { connectHousecall, drainHousecallSyncs, enqueueHousecallSync } from "../src/lib/housecall.ts";
import { connectJobber, drainJobberSyncs, enqueueJobberSync, openOAuthState, sealOAuthState } from "../src/lib/jobber.ts";
import { connectQuickBooks, drainQuickBooksSyncs } from "../src/lib/quickbooks.ts";
import { refreshFsmSchedule } from "../src/lib/fsm-schedule.ts";
import { decideWrite, pickReadSource } from "../src/lib/record-authority.ts";
import { getRecordContract, setRecordContract } from "../src/lib/system-of-record.ts";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
process.env.JOBBER_CLIENT_ID = "test-client";
process.env.JOBBER_CLIENT_SECRET = "jobber-secret";
process.env.QUICKBOOKS_CLIENT_ID = "qb-client";
process.env.QUICKBOOKS_CLIENT_SECRET = "qb-secret";
const HCP_KEY = "hcp_good_key_0123456789abcdef";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const OWNER = "owner@example.test";

const fake = {};
function resetFake() {
  Object.assign(fake, { seq: fake.seq ?? 0, jobberHits: 0, jobberRequests: [], jobberRequestCreate: "ok", hcpHits: 0, hcpLeads: [], qbReceipts: [], qbHits: 0 });
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
  // Jobber
  if (url.pathname === "/api/oauth/token") {
    const access = `jat-${++fake.seq}`;
    liveTokens.add(access);
    return send(200, { access_token: access, refresh_token: `jrt-${fake.seq}`, expires_in: 3600 });
  }
  if (url.pathname === "/api/graphql") {
    const { query, variables } = JSON.parse(raw);
    if (query.includes("account {")) return send(200, { data: { account: { id: `acct-${stamp()}`, name: "Cole Heating" } } });
    if (query.includes("visits(")) return send(200, { data: { visits: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    fake.jobberHits += 1;
    if (query.includes("clientPhones")) return send(200, { data: { clientPhones: { nodes: [] } } });
    if (query.includes("clientCreate")) return send(200, { data: { clientCreate: { client: { id: `client-${++fake.seq}` }, userErrors: [] } } });
    if (query.includes("requestCreate")) {
      const id = `req-${++fake.seq}`;
      fake.jobberRequests.push({ id, ...variables.input });
      if (fake.jobberRequestCreate === "serverError") return send(502, {});
      return send(200, { data: { requestCreate: { request: { id }, userErrors: [] } } });
    }
  }
  // Intuit
  if (url.pathname === "/oauth2/v1/tokens/bearer") {
    const access = `qat-${++fake.seq}`;
    liveTokens.add(access);
    return send(200, { access_token: access, refresh_token: `qrt-${fake.seq}`, expires_in: 3600 });
  }
  const qb = url.pathname.match(/^\/v3\/company\/([^/]+)\/(.+)$/);
  if (qb) {
    const path = qb[2];
    if (path.startsWith("companyinfo/")) return send(200, { CompanyInfo: { CompanyName: "Cole Heating LLC" } });
    fake.qbHits += 1;
    if (path === "query") {
      const q = url.searchParams.get("query");
      if (q.includes("from Account")) return send(200, { QueryResponse: { Account: [{ Id: "80", Name: "Services" }] } });
      return send(200, { QueryResponse: {} });
    }
    const body = raw ? JSON.parse(raw) : {};
    if (path === "customer") return send(200, { Customer: { Id: `c-${++fake.seq}`, ...body } });
    if (path === "item") return send(200, { Item: { Id: `i-${++fake.seq}`, ...body } });
    if (path === "salesreceipt") {
      const r = { Id: `sr-${++fake.seq}`, ...body };
      fake.qbReceipts.push(r);
      return send(200, { SalesReceipt: r });
    }
  }
  // Housecall Pro
  if (req.headers.authorization === `Token ${HCP_KEY}`) {
    if (req.method === "GET" && url.pathname === "/company") return send(200, { id: "co-1", name: "Cole Heating" });
    fake.hcpHits += 1;
    if (req.method === "GET" && url.pathname === "/customers") return send(200, { customers: [], page: 1, total_pages: 1 });
    if (req.method === "POST" && url.pathname === "/customers") return send(201, { id: `cus-${++fake.seq}`, ...JSON.parse(raw) });
    if (req.method === "POST" && url.pathname === "/leads") {
      const lead = { id: `lead-${++fake.seq}`, ...JSON.parse(raw) };
      fake.hcpLeads.push(lead);
      return send(201, lead);
    }
    if (req.method === "GET") return send(200, { jobs: [], page: 1, total_pages: 1 });
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const key of ["JOBBER_API_BASE", "HOUSECALL_API_BASE", "QUICKBOOKS_API_BASE", "QUICKBOOKS_OAUTH_BASE"]) process.env[key] = base;
});
test.after(async () => {
  server.close();
  await prisma.$disconnect();
});
test.beforeEach(() => resetFake());

async function shopWith({ jobber = false, housecall = false, quickbooks = false } = {}) {
  const shop = await prisma.business.create({
    data: { name: "Cole Heating", slug: `ra-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  if (jobber) {
    const { state, cookie } = sealOAuthState(shop.id);
    const pending = openOAuthState(cookie, state, shop.id);
    await connectJobber({ businessId: shop.id, code: "good-code", verifier: pending.verifier });
  }
  if (housecall) await connectHousecall({ businessId: shop.id, apiKey: HCP_KEY });
  if (quickbooks) await connectQuickBooks({ businessId: shop.id, code: "good-code", realmId: "realm-1" });
  return shop;
}

async function leadFor(shop) {
  const phone = randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `ra_${stamp()}`, status: "ended" } });
  const lead = await prisma.lead.create({
    data: { businessId: shop.id, callId: call.id, customerId: customer.id, name: "Ann Cole", phone, serviceType: "No heat", urgency: "urgent", address: "1 Elm St, Evanston IL 60201" },
  });
  return { lead, customer };
}

async function queueBoth(shop) {
  const { lead, customer } = await leadFor(shop);
  assert.equal(await enqueueJobberSync({ businessId: shop.id, leadId: lead.id }), true);
  assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id }), true);
  return { lead, customer };
}

const contract = (businessId, domains, replicas) => setRecordContract({ businessId, domains, replicas, actorEmail: OWNER });
const correlations = (businessId, entityId) => prisma.externalCorrelation.findMany({ where: { businessId, entityId } });

test("decision rules: record of truth, authorized copy, implicit contract, refusal with a reason", () => {
  const base = { version: 3, domains: { customer: "orvius", availability: "orvius", job_state: "housecall", price_invoice: "orvius", payment_receipt: "stripe", notifications: "twilio" }, implicit: false };
  assert.deepEqual(decideWrite({ ...base, replicas: {} }, "housecall", "job_state"), { allowed: true, basis: "record_of_truth", contractVersion: 3 });
  assert.equal(decideWrite({ ...base, replicas: { job_state: ["jobber"] } }, "jobber", "job_state").basis, "authorized_copy");
  const refused = decideWrite({ ...base, replicas: {} }, "jobber", "job_state");
  assert.equal(refused.allowed, false);
  assert.match(refused.reason, /Housecall Pro is the record of truth for jobs \(record contract v3\), and Jobber isn't listed as a copy/);
  assert.equal(decideWrite({ ...base, version: 0, implicit: true, replicas: {} }, "jobber", "job_state").basis, "connected_before_contract");
  assert.equal(pickReadSource({ ...base, replicas: {} }, "availability", ["jobber", "housecall"], ["housecall", "jobber"]), "housecall");
  assert.equal(pickReadSource({ ...base, replicas: { availability: ["jobber"] } }, "availability", ["jobber", "housecall"], ["housecall", "jobber"]), "jobber");
});

test("a replica list cannot name unknown systems, and the record of truth is not its own copy", async () => {
  const shop = await shopWith();
  await assert.rejects(contract(shop.id, { job_state: "housecall" }, { job_state: ["acme"] }), /Unknown copy target/);
  await assert.rejects(contract(shop.id, { job_state: "housecall" }, { bogus: ["jobber"] }), /Unknown part of the record/);
  const saved = await contract(shop.id, { job_state: "housecall" }, { job_state: ["housecall", "jobber", "jobber"] });
  assert.deepEqual(saved.replicas, { job_state: ["jobber"] });
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, idempotencyKey: `record-contract:${shop.id}:${saved.version}` } });
  assert.match(audit.detailJson, /"replicas":\{"job_state":\["jobber"\]\}/);
});

test("no contract yet: both connected tools keep receiving what the owner set up", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  const { lead } = await queueBoth(shop);
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).done, 1);
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).done, 1);
  assert.equal(fake.jobberRequests.length, 1);
  assert.equal(fake.hcpLeads.length, 1);
  const linked = await correlations(shop.id, lead.id);
  assert.deepEqual(linked.map((c) => c.system).sort(), ["housecall", "jobber"]);
});

test("two connections, one record of truth: only Housecall Pro gets the job, Jobber is skipped without a call", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  await contract(shop.id, { job_state: "housecall" });
  const { lead, customer } = await queueBoth(shop);
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).skipped, 1);
  assert.equal(fake.jobberHits, 0, "Jobber is not called at all");
  const jobberRow = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(jobberRow.status, "skipped");
  assert.match(jobberRow.lastError, /Housecall Pro is the record of truth for jobs \(record contract v1\)/);

  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).done, 1);
  assert.equal(fake.hcpLeads.length, 1);
  const linked = await correlations(shop.id, lead.id);
  assert.deepEqual(linked.map((c) => [c.system, c.externalId]), [["housecall", fake.hcpLeads[0].id]]);
  assert.equal((await correlations(shop.id, customer.id))[0].system, "housecall");
});

test("an explicitly authorized copy is preserved: Orvius owns jobs, Jobber still gets them", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  await contract(shop.id, { job_state: "orvius" }, { job_state: ["jobber"] });
  await queueBoth(shop);
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).done, 1);
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).skipped, 1);
  assert.equal(fake.jobberRequests.length, 1);
  assert.equal(fake.hcpHits, 0);
});

test("authority read at send time: a contract changed after queueing wins, both ways", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  const first = await queueBoth(shop);
  // Queued under the implicit contract; the owner then makes Housecall Pro the record.
  await contract(shop.id, { job_state: "housecall" });
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).skipped, 1);
  assert.equal(fake.jobberRequests.length, 0);

  // And back: Jobber added as a copy after the next lead was queued.
  const second = await queueBoth(shop);
  await contract(shop.id, { job_state: "housecall" }, { job_state: ["jobber"] });
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).done, 1);
  assert.equal(fake.jobberRequests.length, 1);
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).done, 2);
  const skipped = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: first.lead.id } });
  assert.equal(skipped.status, "skipped", "a skipped send is not revived behind the owner's back");
  assert.equal((await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: second.lead.id } })).status, "done");
});

test("partial failure: Jobber's reply is lost and held visibly; Housecall Pro still succeeds on its own", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  const { lead } = await queueBoth(shop);
  fake.jobberRequestCreate = "serverError";
  assert.equal((await drainJobberSyncs({ businessId: shop.id })).retry, 1);
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).done, 1);

  fake.jobberRequestCreate = "ok";
  assert.equal((await drainJobberSyncs({ businessId: shop.id, now: new Date(Date.now() + 86_400_000) })).check, 1);
  assert.equal(fake.jobberRequests.length, 1, "never resent blindly");
  const exception = await prisma.reconciliationException.findFirst({ where: { businessId: shop.id, entityId: lead.id, system: "jobber" } });
  assert.ok(exception, "a person sees it on Command");
  assert.equal(exception.status, "open");
  assert.match(exception.observedJson, /response_lost/);
  const linked = await correlations(shop.id, lead.id);
  assert.deepEqual(linked.map((c) => c.system), ["housecall"], "only the side that succeeded is correlated");
});

test("QuickBooks receipts: skipped unless it is the record of truth or a listed copy; sent and correlated when it is", async () => {
  const shop = await shopWith({ quickbooks: true });
  await contract(shop.id, {});
  const pay = async () => {
    const job = await prisma.job.create({ data: { businessId: shop.id, title: "AC repair", status: "completed" } });
    return prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 45000, status: "paid", paidAt: new Date() } });
  };
  const blocked = await pay();
  assert.equal((await drainQuickBooksSyncs({ businessId: shop.id })).skipped, 1);
  assert.equal(fake.qbHits, 0);
  const row = await prisma.quickBooksSync.findFirstOrThrow({ where: { businessId: shop.id, sourceId: blocked.id } });
  assert.match(row.lastError, /Stripe is the record of truth for payments and receipts/);

  await contract(shop.id, {}, { payment_receipt: ["quickbooks"] });
  const allowed = await pay();
  assert.equal((await drainQuickBooksSyncs({ businessId: shop.id })).done, 1);
  assert.equal(fake.qbReceipts.length, 1);
  const [link] = await correlations(shop.id, allowed.id);
  assert.deepEqual([link.system, link.externalId], ["quickbooks", fake.qbReceipts[0].Id]);
});

test("schedule reads with two tools connected follow the contract's availability owner", async () => {
  const shop = await shopWith({ jobber: true, housecall: true });
  assert.equal((await refreshFsmSchedule(shop.id)).source, "housecall", "no contract: the existing fallback order");
  await contract(shop.id, { availability: "jobber" });
  assert.equal((await refreshFsmSchedule(shop.id)).source, "jobber");
  await contract(shop.id, { availability: "orvius" }, { availability: ["jobber"] });
  assert.equal((await refreshFsmSchedule(shop.id)).source, "jobber", "the listed copy before the fallback order");
  assert.equal((await getRecordContract(shop.id)).version, 2);
});
