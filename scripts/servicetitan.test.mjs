#!/usr/bin/env node
/*
 * ServiceTitan: a shop pastes what ServiceTitan generated for the Orvius app,
 * and every new-work call lands in its booking queue under the Orvius booking
 * provider. Never twice, never with a secret readable from a database copy, and
 * nothing offered until Orvius holds an approved app key.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  connectServiceTitan,
  disconnectServiceTitan,
  drainServiceTitanSyncs,
  enqueueServiceTitanSync,
  MAX_SERVICETITAN_ATTEMPTS,
  pickProvider,
  ServiceTitanAuthError,
  serviceTitanBooking,
  serviceTitanConfigured,
  ServiceTitanSetupError,
  serviceTitanStatus,
  splitUsAddress,
} from "../src/lib/servicetitan.ts";
import { openSecret } from "../src/lib/secret-box.ts";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
process.env.SERVICETITAN_APP_KEY = "ak1.test-app-key";
const TENANT = "1234567";
const GOOD = { clientId: "cid.good", clientSecret: "cs1.good-secret" };

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;

const fake = { bookingCreate: "ok", tags: [], bookings: [], tokenCalls: 0, refuse: false, seq: 0 };
function resetFake() {
  Object.assign(fake, { bookingCreate: "ok", tags: [{ id: 77, tagName: "Orvius" }, { id: 12, tagName: "Website" }], bookings: [], tokenCalls: 0, refuse: false });
}
const liveTokens = new Set();

const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.url === "/connect/token") {
    fake.tokenCalls += 1;
    const form = new URLSearchParams(raw);
    if (fake.refuse || form.get("grant_type") !== "client_credentials" || form.get("client_id") !== GOOD.clientId || form.get("client_secret") !== GOOD.clientSecret) {
      return send(400, { error: "invalid_client" });
    }
    const token = `st-${++fake.seq}`;
    liveTokens.add(token);
    return send(200, { access_token: token, expires_in: 900 });
  }
  if (!liveTokens.has(req.headers.authorization?.replace("Bearer ", "")) || fake.refuse) return send(401, {});
  assert.equal(req.headers["st-app-key"], "ak1.test-app-key", "every API call carries the Orvius app key");
  const url = new URL(req.url, "http://st.local");
  if (req.method === "GET" && url.pathname === `/crm/v2/tenant/${TENANT}/booking-provider-tags`) return send(200, { page: 1, hasMore: false, data: fake.tags });
  const booking = url.pathname.match(new RegExp(`^/crm/v2/tenant/${TENANT}/booking-provider/(\\d+)/bookings$`));
  if (req.method === "POST" && booking) {
    if (fake.bookingCreate === "refused") return send(400, { title: "One or more validation errors occurred." });
    const id = ++fake.seq;
    fake.bookings.push({ id, provider: booking[1], ...JSON.parse(raw) });
    // ServiceTitan saved it, but the reply never makes it back.
    if (fake.bookingCreate === "serverError") return send(502, {});
    return send(200, { id });
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.SERVICETITAN_API_BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await prisma.$disconnect();
});
test.beforeEach(() => resetFake());

async function shop() {
  return prisma.business.create({
    data: { name: "Cole Heating", slug: `st-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
}
async function connectedShop() {
  const s = await shop();
  await connectServiceTitan({ businessId: s.id, tenantId: ` ${TENANT} `, ...GOOD });
  return s;
}
async function leadFor(s) {
  const phone = randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: s.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  const call = await prisma.call.create({ data: { businessId: s.id, vapiCallId: `st_${stamp()}`, status: "ended" } });
  const lead = await prisma.lead.create({
    data: {
      businessId: s.id,
      callId: call.id,
      customerId: customer.id,
      name: "Ann Cole",
      phone,
      serviceType: "No heat",
      urgency: "urgent",
      address: "1122 Elinor Place, Evanston, IL 60201",
      notes: "Furnace clicks but no flame.",
    },
  });
  return { lead, customer, phone };
}

test("nothing is offered until Orvius holds an approved app key", () => {
  const key = process.env.SERVICETITAN_APP_KEY;
  delete process.env.SERVICETITAN_APP_KEY;
  assert.equal(serviceTitanConfigured(), false);
  process.env.SERVICETITAN_APP_KEY = key;
  assert.equal(serviceTitanConfigured(), true);
});

test("credentials are kept only once ServiceTitan accepts them; the secret is sealed", async () => {
  const s = await connectedShop();
  const row = await prisma.serviceTitanConnection.findUniqueOrThrow({ where: { businessId: s.id } });
  assert.equal(row.tenantId, TENANT);
  assert.equal(row.providerId, "77", "the tag named Orvius is chosen");
  assert.equal(row.providerName, "Orvius");
  assert.ok(row.clientSecretEnc.startsWith("sb1:") && !row.clientSecretEnc.includes("good-secret"));
  assert.equal(openSecret(row.clientSecretEnc), GOOD.clientSecret);

  const other = await shop();
  await assert.rejects(connectServiceTitan({ businessId: other.id, tenantId: TENANT, clientId: "cid.good", clientSecret: "wrong" }), ServiceTitanAuthError);
  await assert.rejects(connectServiceTitan({ businessId: other.id, tenantId: "acme", ...GOOD }), ServiceTitanSetupError);
  fake.tags = [{ id: 12, tagName: "Website" }, { id: 13, tagName: "Angi" }];
  await assert.rejects(connectServiceTitan({ businessId: other.id, tenantId: TENANT, ...GOOD }), /booking provider tag named Orvius/);
  assert.equal(await prisma.serviceTitanConnection.findUnique({ where: { businessId: other.id } }), null);
});

test("the booking provider is the one named Orvius, or the shop's only active one", () => {
  assert.deepEqual(pickProvider([{ id: 1, tagName: "Website" }, { id: 2, tagName: "orvius ai" }]), { id: "2", name: "orvius ai" });
  assert.deepEqual(pickProvider([{ id: 5, tagName: "Phones" }]), { id: "5", name: "Phones" });
  assert.equal(pickProvider([{ id: 5, tagName: "Orvius", active: false }]), null);
  assert.equal(pickProvider([{ id: 1, tagName: "A" }, { id: 2, tagName: "B" }]), null);
});

test("a call lands once in the booking queue with the caller, address and booked time", async () => {
  const s = await connectedShop();
  const { lead, phone } = await leadFor(s);
  await prisma.job.create({
    data: { businessId: s.id, leadId: lead.id, title: "No heat", status: "scheduled", scheduledAt: new Date("2026-10-02T15:00:00Z"), durationMin: 60 },
  });
  assert.equal(await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id, skipReason: "follow_up" }), false);
  assert.equal(await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id }), true);
  assert.equal(await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id }), false, "a replay queues nothing new");

  assert.equal((await drainServiceTitanSyncs({ businessId: s.id })).done, 1);
  assert.equal(fake.bookings.length, 1);
  const b = fake.bookings[0];
  assert.equal(b.provider, "77");
  assert.equal(b.source, "Orvius");
  assert.equal(b.externalId, lead.id);
  assert.equal(b.name, "Ann Cole");
  assert.equal(b.isFirstTimeClient, true);
  assert.deepEqual(b.address, { street: "1122 Elinor Place", city: "Evanston", state: "IL", zip: "60201", country: "USA" });
  assert.deepEqual(b.contacts, [{ type: "Phone", value: phone.slice(-10) }]);
  assert.equal(b.start, "2026-10-02T15:00:00.000Z");
  assert.match(b.summary, /^No heat, from a call answered by Orvius\./);
  assert.match(b.summary, /Confirm it here before dispatching/);
  assert.deepEqual(await drainServiceTitanSyncs({ businessId: s.id }), { done: 0, skipped: 0, check: 0, retry: 0, failed: 0 });
  assert.equal((await serviceTitanStatus(s.id)).sentLast30Days, 1);
});

test("a lost reply is never resent: the lead is held for a person to check", async () => {
  const s = await connectedShop();
  const { lead } = await leadFor(s);
  await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id });
  fake.bookingCreate = "serverError";
  assert.equal((await drainServiceTitanSyncs({ businessId: s.id })).retry, 1);
  fake.bookingCreate = "ok";
  assert.equal((await drainServiceTitanSyncs({ businessId: s.id, now: new Date(Date.now() + 86_400_000) })).check, 1);
  assert.equal(fake.bookings.length, 1, "no second booking");
  assert.equal((await serviceTitanStatus(s.id)).needsAttention, 1);
});

test("a refused booking is retried with backoff, then given up on visibly", async () => {
  const s = await connectedShop();
  const { lead } = await leadFor(s);
  await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id });
  fake.bookingCreate = "refused";
  let now = new Date();
  for (let i = 1; i < MAX_SERVICETITAN_ATTEMPTS; i++) {
    assert.equal((await drainServiceTitanSyncs({ businessId: s.id, now })).retry, 1);
    now = new Date(now.getTime() + 7 * 3_600_000);
  }
  assert.equal((await drainServiceTitanSyncs({ businessId: s.id, now })).failed, 1);
  assert.match((await prisma.serviceTitanSync.findUniqueOrThrow({ where: { leadId: lead.id } })).lastError, /validation errors/);
});

test("revoked access asks the owner to reconnect and forgets the secret", async () => {
  const s = await connectedShop();
  const { lead } = await leadFor(s);
  await enqueueServiceTitanSync({ businessId: s.id, leadId: lead.id });
  fake.refuse = true;
  assert.equal((await drainServiceTitanSyncs({ businessId: s.id })).failed, 1);
  const row = await prisma.serviceTitanConnection.findUniqueOrThrow({ where: { businessId: s.id } });
  assert.equal(row.status, "reconnect");
  assert.equal(row.clientSecretEnc, null);
  assert.equal(fake.bookings.length, 0);
  await disconnectServiceTitan(s.id);
  assert.equal((await serviceTitanStatus(s.id)).status, "disconnected");
});

test("addresses split only when certain; everything else rides in the summary", () => {
  assert.deepEqual(splitUsAddress("12 Oak St, Evanston IL 60201"), { street: "12 Oak St", city: "Evanston", state: "IL", zip: "60201", country: "USA" });
  assert.equal(splitUsAddress("the blue house by the school"), null);
  const body = serviceTitanBooking(
    { id: "lead_1", name: null, phone: null, address: "the blue house", serviceType: null, urgency: null, notes: null },
    null,
    "America/New_York",
    false,
  );
  assert.equal(body.name, "Orvius caller");
  assert.equal(body.address, undefined);
  assert.equal(body.contacts, undefined);
  assert.match(body.summary, /Address: the blue house\./);
});
