#!/usr/bin/env node
/*
 * Jobber: a shop connects once, and every new-work call lands in its Jobber as
 * a request against the right client. Never twice, never with tokens readable
 * from a database copy, and never by losing the connection to a token race.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  connectJobber,
  disconnectJobber,
  drainJobberSyncs,
  enqueueJobberSync,
  handleJobberDisconnect,
  jobberAccessToken,
  jobberAuthorizeUrl,
  jobberRequestInput,
  jobberStatus,
  MAX_SYNC_ATTEMPTS,
  openOAuthState,
  sealOAuthState,
  verifyJobberWebhook,
} from "../src/lib/jobber.ts";
import { openSecret, sealSecret } from "../src/lib/secret-box.ts";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
process.env.JOBBER_CLIENT_ID = "test-client";
process.env.JOBBER_CLIENT_SECRET = "my app's OAuth client secret";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

/* ── A fake Jobber: OAuth token endpoint + the GraphQL calls Orvius makes ── */
const fake = {
  refreshCalls: 0,
  refreshDelayMs: 0,
  refuseRefresh: false,
  requestCreate: "ok", // ok | userError | serverError
  clients: [], // { id, number }
  requests: [],
  created: [],
  disconnects: 0,
  seq: 0,
};
function resetFake() {
  Object.assign(fake, { refreshCalls: 0, refreshDelayMs: 0, refuseRefresh: false, requestCreate: "ok", clients: [], requests: [], created: [], disconnects: 0 });
}
const liveTokens = new Set();

const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.url === "/api/oauth/token") {
    const form = new URLSearchParams(raw);
    if (form.get("grant_type") === "refresh_token") {
      fake.refreshCalls += 1;
      if (fake.refreshDelayMs) await new Promise((r) => setTimeout(r, fake.refreshDelayMs));
      if (fake.refuseRefresh) return send(401, { error: "invalid_grant" });
    } else if (form.get("code") !== "good-code" || !form.get("code_verifier")) {
      return send(400, { error: "invalid_grant" });
    }
    const access = `at-${++fake.seq}`;
    liveTokens.add(access);
    return send(200, { access_token: access, refresh_token: `rt-${fake.seq}`, expires_in: 3600 });
  }
  if (req.url === "/api/graphql") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!liveTokens.has(token)) return send(401, { message: "unauthorized" });
    assert.equal(req.headers["x-jobber-graphql-version"], "2025-04-16");
    const { query, variables } = JSON.parse(raw);
    if (query.includes("account {")) return send(200, { data: { account: { id: "acct-1", name: "Cole Heating" } } });
    if (query.includes("appDisconnect")) {
      fake.disconnects += 1;
      return send(200, { data: { appDisconnect: { userErrors: [] } } });
    }
    if (query.includes("clientPhones")) {
      const nodes = fake.clients
        .filter((c) => c.number.replace(/\D/g, "").includes(variables.searchTerm))
        .map((c) => ({ number: c.number, client: { id: c.id } }));
      return send(200, { data: { clientPhones: { nodes } } });
    }
    if (query.includes("clientCreate")) {
      const id = `client-${++fake.seq}`;
      fake.clients.push({ id, number: variables.input.phones[0].number });
      fake.created.push(variables.input);
      return send(200, { data: { clientCreate: { client: { id }, userErrors: [] } } });
    }
    if (query.includes("requestCreate")) {
      if (fake.requestCreate === "userError") return send(200, { data: { requestCreate: { request: null, userErrors: [{ message: "Title is too long" }] } } });
      const id = `req-${++fake.seq}`;
      fake.requests.push({ id, ...variables.input });
      // Jobber saved it, but the reply never makes it back.
      if (fake.requestCreate === "serverError") return send(502, {});
      return send(200, { data: { requestCreate: { request: { id }, userErrors: [] } } });
    }
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.JOBBER_API_BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await prisma.$disconnect();
});
test.beforeEach(() => resetFake());

async function connectedShop() {
  const shop = await prisma.business.create({
    data: { name: "Cole Heating", slug: `jobber-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  const { state, challenge, cookie } = sealOAuthState(shop.id);
  const pending = openOAuthState(cookie, state, shop.id);
  assert.ok(pending, "the sealed state opens for the shop that started it");
  assert.ok(jobberAuthorizeUrl({ state, codeChallenge: challenge }).includes("code_challenge_method=S256"));
  await connectJobber({ businessId: shop.id, code: "good-code", verifier: pending.verifier });
  return shop;
}

async function leadFor(shop, overrides = {}) {
  const phone = overrides.phone ?? randomPhone();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `jb_${stamp()}`, status: "ended" } });
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

test("tokens at rest are sealed: a database copy alone cannot act as the shop", async () => {
  const sealed = sealSecret("at-secret");
  assert.ok(sealed.startsWith("sb1:") && !sealed.includes("at-secret"));
  assert.equal(openSecret(sealed), "at-secret");
  const flipped = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(openSecret(flipped), null, "tampered value does not open");
  const key = process.env.ORVIUS_TOKEN_KEY;
  process.env.ORVIUS_TOKEN_KEY = "another-key-entirely-0123456789abcdef";
  assert.equal(openSecret(sealed), null, "another key does not open it");
  process.env.ORVIUS_TOKEN_KEY = key;

  const shop = await connectedShop();
  const row = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.equal(row.accountName, "Cole Heating");
  assert.equal(row.status, "active");
  assert.ok(!row.accessTokenEnc.includes("at-") && !row.refreshTokenEnc.includes("rt-"));
});

test("webhooks: only a body signed with our client secret is accepted", () => {
  const body = '{"data":{"webHookEvent":{"topic":"APP_DISCONNECT","appId":"id","accountId":"MQ==","itemId":"MQ==","occurredAt":"2026-07-16T16:31:31-06:00"}}}';
  // Jobber's scheme: base64 HMAC-SHA256 of the raw body under the app's OAuth client secret.
  const signed = createHmac("sha256", process.env.JOBBER_CLIENT_SECRET).update(body).digest("base64");
  assert.equal(verifyJobberWebhook(body, signed), true);
  assert.equal(verifyJobberWebhook(body.replace("MQ==", "Mg=="), signed), false, "an edited body fails");
  assert.equal(verifyJobberWebhook(body, createHmac("sha256", "someone else").update(body).digest("base64")), false);
  assert.equal(verifyJobberWebhook(body, "short"), false);
  assert.equal(verifyJobberWebhook(body, null), false);
});

test("OAuth state only completes for the same shop, the same state, within ten minutes", async () => {
  const { state, cookie } = sealOAuthState("shop-a", new Date("2026-09-29T12:00:00Z"));
  assert.ok(openOAuthState(cookie, state, "shop-a", new Date("2026-09-29T12:05:00Z")));
  assert.equal(openOAuthState(cookie, state, "shop-b", new Date("2026-09-29T12:05:00Z")), null);
  assert.equal(openOAuthState(cookie, `${state}x`, "shop-a", new Date("2026-09-29T12:05:00Z")), null);
  assert.equal(openOAuthState(cookie, state, "shop-a", new Date("2026-09-29T12:11:00Z")), null);
  assert.equal(openOAuthState("garbage", state, "shop-a"), null);
});

test("expired access refreshes once even when two workers need it at the same moment", async () => {
  const shop = await connectedShop();
  await prisma.jobberConnection.update({ where: { businessId: shop.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
  const before = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  fake.refreshDelayMs = 300;
  const [a, b] = await Promise.all([jobberAccessToken(shop.id), jobberAccessToken(shop.id)]);
  assert.equal(fake.refreshCalls, 1, "the rotating refresh token is redeemed exactly once");
  assert.ok(a && a === b);
  const after = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.notEqual(openSecret(after.refreshTokenEnc), openSecret(before.refreshTokenEnc), "the new refresh token is stored");
  assert.equal(after.refreshClaimAt, null);
  assert.equal(await jobberAccessToken(shop.id), a, "a fresh token is reused, not refreshed");
  assert.equal(fake.refreshCalls, 1);
});

test("a refused refresh asks the owner to reconnect and forgets the dead tokens", async () => {
  const shop = await connectedShop();
  await prisma.jobberConnection.update({ where: { businessId: shop.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
  fake.refuseRefresh = true;
  assert.equal(await jobberAccessToken(shop.id), null);
  const row = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.equal(row.status, "reconnect");
  assert.equal(row.accessTokenEnc, null);
  assert.equal(row.refreshTokenEnc, null);
  const status = await jobberStatus(shop.id);
  assert.equal(status.status, "reconnect");
  assert.ok(status.lastError);
});

test("only new work is queued, once per lead, and only for a connected shop", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  for (const skipReason of ["existing_job", "follow_up", "complaint", "info_only"]) {
    assert.equal(await enqueueJobberSync({ businessId: shop.id, leadId: lead.id, skipReason }), false, skipReason);
  }
  assert.equal(await enqueueJobberSync({ businessId: shop.id, leadId: lead.id, nonService: true }), false, "sales calls stay out");
  assert.equal(await enqueueJobberSync({ businessId: shop.id, leadId: lead.id, skipReason: "missing_address" }), true);
  assert.equal(await enqueueJobberSync({ businessId: shop.id, leadId: lead.id }), false, "a webhook replay queues nothing new");

  const unconnected = await prisma.business.create({
    data: { name: "No Jobber", slug: `nojb-${stamp()}`, hoursJson: "{}", servicesJson: "[]", environment: "test" },
  });
  assert.equal(await enqueueJobberSync({ businessId: unconnected.id, leadId: lead.id }), false);
});

test("a call lands as a request on the existing Jobber client, matched by phone", async () => {
  const shop = await connectedShop();
  const { lead, customer, phone } = await leadFor(shop);
  fake.clients.push({ id: "client-existing", number: `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}` });
  await enqueueJobberSync({ businessId: shop.id, leadId: lead.id });

  const tally = await drainJobberSyncs({ businessId: shop.id });
  assert.equal(tally.done, 1);
  assert.equal(fake.created.length, 0, "no duplicate client in Jobber");
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0].clientId, "client-existing");
  assert.equal(fake.requests[0].title, "No heat");
  assert.match(fake.requests[0].assessment.instructions, /Urgency: urgent\./);
  assert.match(fake.requests[0].assessment.instructions, /1122 Elinor Place/);

  const sync = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.status, "done");
  assert.equal(sync.jobberRequestId, fake.requests[0].id);
  const linked = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(linked.jobberClientId, "client-existing", "the match is remembered for the next call");

  assert.deepEqual(await drainJobberSyncs({ businessId: shop.id }), { done: 0, skipped: 0, check: 0, retry: 0, failed: 0 });
  assert.equal(fake.requests.length, 1, "draining again sends nothing");
  assert.equal((await jobberStatus(shop.id)).sentLast30Days, 1);
});

test("a new caller becomes a Jobber client once; a booked time rides along in the request", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await prisma.job.create({
    data: { businessId: shop.id, leadId: lead.id, title: "No heat", status: "scheduled", scheduledAt: new Date("2026-10-02T15:00:00Z"), durationMin: 60 },
  });
  await enqueueJobberSync({ businessId: shop.id, leadId: lead.id });
  await drainJobberSyncs({ businessId: shop.id });
  assert.equal(fake.created.length, 1);
  assert.deepEqual([fake.created[0].firstName, fake.created[0].lastName], ["Ann", "Cole"]);
  assert.match(fake.requests[0].title, /^No heat · booked /);
  assert.match(fake.requests[0].assessment.instructions, /Orvius booked .* Confirm it here/);
});

test("a lost reply is never resent: the lead is held for a person to check", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await enqueueJobberSync({ businessId: shop.id, leadId: lead.id });
  fake.requestCreate = "serverError";
  const first = await drainJobberSyncs({ businessId: shop.id });
  assert.equal(first.retry, 1);
  assert.equal(fake.requests.length, 1);

  fake.requestCreate = "ok";
  const later = new Date(Date.now() + 24 * 60 * 60_000);
  const second = await drainJobberSyncs({ businessId: shop.id, now: later });
  assert.equal(second.check, 1);
  assert.equal(fake.requests.length, 1, "no second request in Jobber");
  const sync = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.status, "check");
  assert.equal((await jobberStatus(shop.id)).needsAttention, 1);
});

test("a request Jobber refuses is retried with backoff, then given up on visibly", async () => {
  const shop = await connectedShop();
  const { lead } = await leadFor(shop);
  await enqueueJobberSync({ businessId: shop.id, leadId: lead.id });
  fake.requestCreate = "userError";
  let now = new Date();
  const first = await drainJobberSyncs({ businessId: shop.id, now });
  assert.equal(first.retry, 1);
  let sync = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.requestSentAt, null, "a refusal is not a send");
  assert.ok(sync.nextAttemptAt > now, "not retried immediately");
  assert.deepEqual(await drainJobberSyncs({ businessId: shop.id, now }), { done: 0, skipped: 0, check: 0, retry: 0, failed: 0 });

  for (let i = 1; i < MAX_SYNC_ATTEMPTS; i++) {
    now = new Date(now.getTime() + 7 * 60 * 60_000);
    await drainJobberSyncs({ businessId: shop.id, now });
  }
  sync = await prisma.jobberSync.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(sync.status, "failed");
  assert.equal(sync.attempts, MAX_SYNC_ATTEMPTS);
  assert.match(sync.lastError, /Title is too long/);
  assert.equal(fake.requests.length, 0);
});

test("disconnecting tells Jobber and forgets the tokens; Jobber's own disconnect does too", async () => {
  const shop = await connectedShop();
  await disconnectJobber(shop.id);
  assert.equal(fake.disconnects, 1);
  let row = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: shop.id } });
  assert.equal(row.status, "disconnected");
  assert.equal(row.accessTokenEnc, null);
  assert.equal(await jobberAccessToken(shop.id), null);

  const other = await connectedShop();
  const otherRow = await prisma.jobberConnection.findUniqueOrThrow({ where: { businessId: other.id } });
  await prisma.jobberConnection.update({ where: { id: otherRow.id }, data: { accountId: `acct-${stamp()}` } });
  const { accountId } = await prisma.jobberConnection.findUniqueOrThrow({ where: { id: otherRow.id } });
  assert.equal(await handleJobberDisconnect(accountId), 1);
  assert.equal(await handleJobberDisconnect(accountId), 0, "a redelivered webhook changes nothing");
  row = await prisma.jobberConnection.findUniqueOrThrow({ where: { id: otherRow.id } });
  assert.equal(row.status, "disconnected");
  assert.equal(row.refreshTokenEnc, null);
});

test("end to end: a booked call reaches Jobber once, even when the report is finished twice", async () => {
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
    delete process.env[key];
  }
  const { captureEndOfCallReport, finishCallReport } = await import("../src/lib/call-ingest.ts");
  const shop = await connectedShop();
  await prisma.business.update({
    where: { id: shop.id },
    data: { billingStatus: "active", billingPlan: "pro" },
  });
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech One", skillsJson: "[]" } });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
  const vapiCallId = `jb-e2e-${stamp()}`;
  const phone = randomPhone();
  const captured = await captureEndOfCallReport({
    business,
    vapiCallId,
    message: {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: phone } },
      summary: "Ann Lee called about AC not cooling.",
      transcript: "User: my AC is not cooling",
      durationSeconds: 120,
      analysis: { structuredData: { name: "Ann Lee", phone, serviceType: "AC not cooling", urgency: "same-day", address: "12 Oak St, Austin TX 78701" } },
    },
  });
  const done = await finishCallReport(captured);
  assert.equal(done.autoBooked, true);
  assert.equal(fake.requests.length, 1, "sent right after the call");
  assert.match(fake.requests[0].title, /^AC not cooling · booked /);

  await finishCallReport(captured).catch(() => null);
  await drainJobberSyncs({ businessId: shop.id, now: new Date(Date.now() + 86_400_000) });
  assert.equal(fake.requests.length, 1, "never a second request for the same call");
});

test("request text stays inside Jobber's limits", () => {
  const input = jobberRequestInput(
    { name: null, phone: "+15551234567", address: null, serviceType: "x".repeat(300), urgency: null, notes: "n".repeat(2000) },
    null,
    "America/Chicago",
  );
  assert.ok(input.title.length <= 120);
  assert.ok(input.assessment.instructions.length < 700);
});
