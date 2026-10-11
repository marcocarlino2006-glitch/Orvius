#!/usr/bin/env node
/*
 * Housecall Pro: a shop pastes its API key once, and every new-work call lands
 * in its Housecall Pro as a lead against the right customer. Never twice, never
 * with a key readable from a database copy, and a refused key asks the owner
 * for a new one instead of failing quietly.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  connectHousecall,
  disconnectHousecall,
  drainHousecallSyncs,
  enqueueHousecallSync,
  HousecallAuthError,
  housecallLeadNote,
  housecallStatus,
  MAX_HOUSECALL_ATTEMPTS,
} from "../src/lib/housecall.ts";
import { openSecret } from "../src/lib/secret-box.ts";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
const GOOD_KEY = "hcp_good_key_0123456789abcdef";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;

/* ── A fake Housecall Pro: the REST calls Orvius makes ── */
const fake = { leadCreate: "ok", customers: [], leads: [], created: [], liveKeys: new Set([GOOD_KEY]), seq: 0 };
function resetFake() {
  Object.assign(fake, { leadCreate: "ok", customers: [], leads: [], created: [], liveKeys: new Set([GOOD_KEY]) });
}

const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const key = req.headers.authorization?.replace(/^Token /, "");
  if (!fake.liveKeys.has(key)) return send(401, { message: "unauthorized" });
  const url = new URL(req.url, "http://hcp.local");
  if (req.method === "GET" && url.pathname === "/company") return send(200, { id: "co-1", name: "Cole Heating" });
  if (req.method === "GET" && url.pathname === "/customers") {
    const q = url.searchParams.get("q") ?? "";
    return send(200, { customers: fake.customers.filter((c) => (c.mobile_number ?? "").replace(/\D/g, "").includes(q)), page: 1, total_pages: 1 });
  }
  if (req.method === "POST" && url.pathname === "/customers") {
    const body = JSON.parse(raw);
    const customer = { id: `cus-${++fake.seq}`, ...body };
    fake.created.push(customer);
    fake.customers.push(customer);
    return send(201, customer);
  }
  if (req.method === "POST" && url.pathname === "/leads") {
    const body = JSON.parse(raw);
    if (fake.leadCreate === "refused") return send(422, { message: "customer_id is invalid" });
    const id = `lead-${++fake.seq}`;
    fake.leads.push({ id, ...body });
    // Housecall Pro saved it, but the reply never makes it back.
    if (fake.leadCreate === "serverError") return send(502, {});
    return send(201, { id, ...body });
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.HOUSECALL_API_BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await prisma.$disconnect();
});
test.beforeEach(() => resetFake());

async function connectedShop() {
  const shop = await prisma.business.create({
    data: { name: "Cole Heating", slug: `hcp-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  await connectHousecall({ businessId: shop.id, apiKey: ` ${GOOD_KEY} ` });
  return shop;
}

async function leadFor(shop, overrides = {}) {
  const phone = overrides.phone ?? randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `hcp_${stamp()}`, status: "ended" } });
  const lead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      callId: call.id,
      customerId: customer.id,
      name: "Ann Cole",
      phone,
      serviceType: "No heat",
      urgency: "urgent",
      address: "1122 Elinor Place, Evanston IL 60201",
      notes: "Furnace clicks but no flame.",
    },
  });
  return { lead, customer, phone };
}

test("a key is kept only once Housecall Pro accepts it, and is sealed at rest", async () => {
  const shop = await connectedShop();
  const row = await prisma.housecallConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.equal(row.companyName, "Cole Heating");
  assert.equal(row.status, "active");
  assert.ok(row.apiKeyEnc.startsWith("sb1:") && !row.apiKeyEnc.includes(GOOD_KEY));
  assert.equal(openSecret(row.apiKeyEnc), GOOD_KEY, "stored trimmed");

  const other = await prisma.business.create({ data: { name: "Bad Key", slug: `hcpbad-${stamp()}`, hoursJson: "{}", servicesJson: "[]", environment: "test" } });
  await assert.rejects(connectHousecall({ businessId: other.id, apiKey: "hcp_wrong_key_0123456789abcdef" }), HousecallAuthError);
  await assert.rejects(connectHousecall({ businessId: other.id, apiKey: "short" }), HousecallAuthError);
  assert.equal(await prisma.housecallConnection.findUnique({ where: { businessId: other.id } }), null, "a refused key leaves nothing behind");
});

test("only new work is queued, once per lead, and only for a connected shop", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  for (const skipReason of ["existing_job", "follow_up", "complaint", "info_only"]) {
    assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id, skipReason }), false, skipReason);
  }
  assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id, nonService: true }), false);
  assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id }), true);
  assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id }), false, "a replay queues nothing new");
  await disconnectHousecall(shop.id);
  const { lead: later } = await leadFor(shop);
  assert.equal(await enqueueHousecallSync({ businessId: shop.id, leadId: later.id }), false, "disconnected shops get nothing");
});

test("a call lands as a lead on the existing customer, matched by phone", async () => {
  const shop = await connectedShop();
  const { lead, customer, phone } = await leadFor(shop);
  fake.customers.push({ id: "cus-existing", mobile_number: `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}` });
  await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id });

  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).done, 1);
  assert.equal(fake.created.length, 0, "no duplicate customer");
  assert.equal(fake.leads.length, 1);
  assert.equal(fake.leads[0].customer_id, "cus-existing");
  assert.equal(fake.leads[0].lead_source, "Orvius");
  assert.match(fake.leads[0].note, /^No heat, from a call answered by Orvius\./);
  assert.match(fake.leads[0].note, /1122 Elinor Place/);

  const sync = await prisma.housecallSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.status, "done");
  assert.equal(sync.housecallLeadId, fake.leads[0].id);
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).housecallCustomerId, "cus-existing");
  assert.deepEqual(await drainHousecallSyncs({ businessId: shop.id }), { done: 0, skipped: 0, check: 0, retry: 0, failed: 0 });
  assert.equal((await housecallStatus(shop.id)).sentLast30Days, 1);
});

test("a new caller becomes a customer once; a booked time rides along", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await prisma.job.create({
    data: { businessId: shop.id, leadId: lead.id, title: "No heat", status: "scheduled", scheduledAt: new Date("2026-10-02T15:00:00Z"), durationMin: 60 },
  });
  await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id });
  await drainHousecallSyncs({ businessId: shop.id });
  assert.equal(fake.created.length, 1);
  assert.deepEqual([fake.created[0].first_name, fake.created[0].last_name], ["Ann", "Cole"]);
  assert.match(fake.leads[0].note, /Orvius booked .* Confirm it here/);
});

test("a lost reply is never resent: the lead is held for a person to check", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id });
  fake.leadCreate = "serverError";
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).retry, 1);
  fake.leadCreate = "ok";
  const second = await drainHousecallSyncs({ businessId: shop.id, now: new Date(Date.now() + 24 * 60 * 60_000) });
  assert.equal(second.check, 1);
  assert.equal(fake.leads.length, 1, "no second lead");
  assert.equal((await housecallStatus(shop.id)).needsAttention, 1);
});

test("a refused lead is retried with backoff, then given up on visibly", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id });
  fake.leadCreate = "refused";
  let now = new Date();
  for (let i = 1; i < MAX_HOUSECALL_ATTEMPTS; i++) {
    assert.equal((await drainHousecallSyncs({ businessId: shop.id, now })).retry, 1);
    now = new Date(now.getTime() + 7 * 60 * 60_000);
  }
  assert.equal((await drainHousecallSyncs({ businessId: shop.id, now })).failed, 1);
  const sync = await prisma.housecallSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.status, "failed");
  assert.match(sync.lastError, /422/);
});

test("a revoked key asks the owner to reconnect and forgets the key", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await enqueueHousecallSync({ businessId: shop.id, leadId: lead.id });
  fake.liveKeys.clear();
  assert.equal((await drainHousecallSyncs({ businessId: shop.id })).failed, 1);
  const row = await prisma.housecallConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.equal(row.status, "reconnect");
  assert.equal(row.apiKeyEnc, null);
  assert.equal((await housecallStatus(shop.id)).status, "reconnect");
});

test("the lead note reads well and stays short", () => {
  const note = housecallLeadNote(
    { name: "Ann", phone: "+15552223333", address: null, serviceType: null, urgency: null, notes: "x".repeat(2000) },
    null,
    "America/New_York",
  );
  assert.match(note, /^Service request, from a call answered by Orvius\./);
  assert.ok(note.length < 700);
});
