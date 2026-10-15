#!/usr/bin/env node
/*
 * Account security and personal data: one click ends every session on every
 * device, every sign-in change is emailed to the address itself, and an owner
 * can delete what the shop holds about one customer without breaking its
 * books or forgetting that the person said STOP.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];

const { revokeAllSessions, sessionRevoked } = await import("../src/lib/account-security.ts");
const { forgetCustomer, FORGOTTEN } = await import("../src/lib/forget-customer.ts");
const { purgeExpiredCallContent } = await import("../src/lib/retention.ts");
const { can } = await import("../src/lib/workspace-access-labels.ts");
const { deviceLabel, placeLabel, recordSignIn } = await import("../src/lib/sign-in-history.ts");
const { exportCustomerData } = await import("../src/lib/customer-data-export.ts");
const securityTxt = await import("../src/app/.well-known/security.txt/route.ts");

const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const RECORDING = `https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE${"a".repeat(32)}`;

async function shop() {
  return prisma.business.create({
    data: { name: "Summit Heating", slug: `sec-${stamp()}`, environment: "test", ownerPhone: randomPhone(), ownerEmail: `o-${stamp()}@example.test` },
  });
}
async function drop(id) {
  await prisma.lead.deleteMany({ where: { businessId: id } }).catch(() => {});
  await prisma.business.delete({ where: { id } }).catch(() => {});
}

async function customerWithHistory(business, phone) {
  const customer = await prisma.customer.create({ data: { businessId: business.id, phone, phoneNormalized: phone } });
  const call = await prisma.call.create({
    data: {
      businessId: business.id,
      vapiCallId: `vapi-${stamp()}`,
      callerPhone: phone,
      customerId: customer.id,
      transcript: "My name is Dana Reyes, 14 Elm St, furnace is out",
      recordingUrl: "https://storage.vapi.ai/x.wav",
      summary: "Dana Reyes, no heat at 14 Elm St",
    },
  });
  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      callId: call.id,
      customerId: customer.id,
      name: "Dana Reyes",
      phone,
      email: "dana@example.test",
      address: "14 Elm St",
      notes: `Gate code 4412\nVoicemail (12s): ${RECORDING}`,
    },
  });
  const job = await prisma.job.create({
    data: { businessId: business.id, title: "No heat", leadId: lead.id, customerId: customer.id, address: "14 Elm St", notes: "Dog in yard" },
  });
  await prisma.message.create({ data: { businessId: business.id, phoneNormalized: phone, direction: "inbound", author: "customer", body: "Is 3pm ok?" } });
  return { customer, call, lead, job };
}

test("a revocation ends sessions that started before it and none after", async () => {
  const email = `sec-${stamp()}@example.test`;
  const before = Date.now() - 1000;
  assert.equal(await sessionRevoked(email, before), false);
  await revokeAllSessions(email.toUpperCase());
  assert.equal(await sessionRevoked(email, before), true);
  assert.equal(await sessionRevoked(email, undefined), true, "a session with no sign-in time is covered");
  assert.equal(await sessionRevoked(email, Date.now() + 1000), false, "signing in again works");
  await prisma.sessionRevocation.delete({ where: { email } });
});

test("every server session check consults the revocation, and the routes that change sign-in revoke or notify", () => {
  const auth = read("src/auth.ts");
  assert.match(auth, /token\.signedInAt = Date\.now\(\)/);
  assert.match(auth, /sessionRevoked\(token\.email/);
  assert.match(auth, /\)\) return null;/);
  const security = read("src/app/api/account/security/route.ts");
  assert.match(security, /sign_out_everywhere/);
  assert.match(security, /revokeAllSessions\(/);
  for (const change of ["signed_out_everywhere", "two_step_on", "two_step_off", "recovery_codes"]) assert.match(security, new RegExp(`"${change}"`));
  const reset = read("src/app/api/auth/password-reset/route.ts");
  assert.match(reset, /revokeAllSessions\(/);
  assert.match(reset, /"password_changed"/);
  assert.match(read("src/components/settings-center/security-group.tsx"), /Sign out of all devices/);
  assert.match(read("src/lib/account-security.ts"), /"Sign out of all devices"/, "the email names the button the owner will see");
});

test("only the owner can delete a customer's data", () => {
  assert.equal(can("owner", "customers.forget"), true);
  assert.equal(can("manager", "customers.forget"), false);
  assert.equal(can("dispatcher", "customers.forget"), false);
  assert.match(read("src/app/api/customers/[id]/route.ts"), /requirePermission\("customers\.forget"/);
});

test("forgetting a customer removes who they are and keeps the shop's records and the STOP", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const other = randomPhone();
    const { customer, call, lead, job } = await customerWithHistory(business, phone);
    const kept = await customerWithHistory(business, other);
    await prisma.smsOptOut.create({ data: { businessId: business.id, phone, phoneNormalized: phone } });

    const vapi = [];
    const twilio = [];
    const result = await forgetCustomer(
      { businessId: business.id, customerId: customer.id, actorEmail: business.ownerEmail, role: "owner" },
      { deleteVapi: async (id) => (vapi.push(id), "deleted"), deleteTwilio: async (sid) => (twilio.push(sid), "deleted") },
    );
    assert.deepEqual(result, { ok: true, calls: 1, requests: 1, jobs: 1, texts: 1, remotePending: 0, local: "scrubbed", provider: "confirmed" });
    assert.deepEqual(vapi, [call.vapiCallId]);
    assert.deepEqual(twilio, [`RE${"a".repeat(32)}`]);

    const c = await prisma.call.findUnique({ where: { id: call.id } });
    assert.equal(c.transcript, null);
    assert.equal(c.recordingUrl, null);
    assert.equal(c.callerPhone, null);
    assert.equal(c.summary, FORGOTTEN);
    assert.ok(c.forgetRequestedAt && c.contentPurgedAt);

    const l = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.deepEqual([l.name, l.phone, l.email, l.address, l.notes], [null, null, null, null, FORGOTTEN]);
    const j = await prisma.job.findUnique({ where: { id: job.id } });
    assert.ok(j, "the job row stays for the shop's counts and invoices");
    assert.deepEqual([j.address, j.notes, j.customerId], [null, null, null]);

    assert.equal(await prisma.customer.findUnique({ where: { id: customer.id } }), null);
    assert.equal(await prisma.message.count({ where: { businessId: business.id, phoneNormalized: phone } }), 0);
    assert.equal(await prisma.smsOptOut.count({ where: { businessId: business.id, phoneNormalized: phone } }), 1, "the STOP is kept");

    assert.ok(await prisma.customer.findUnique({ where: { id: kept.customer.id } }), "other customers are untouched");
    assert.equal((await prisma.call.findUnique({ where: { id: kept.call.id } })).transcript, kept.call.transcript);
    assert.equal(await prisma.message.count({ where: { businessId: business.id, phoneNormalized: other } }), 1);

    const audit = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "customer.forgotten" } });
    assert.ok(audit);
    assert.doesNotMatch(audit.summary + (audit.detailJson ?? ""), new RegExp(phone.slice(2)));
  } finally {
    await drop(business.id);
  }
});

test("when Vapi or Twilio can't delete yet, the retention sweep finishes the job", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const { customer, call, lead } = await customerWithHistory(business, phone);
    const fail = async () => {
      throw new Error("503");
    };
    const result = await forgetCustomer(
      { businessId: business.id, customerId: customer.id, actorEmail: business.ownerEmail, role: "owner" },
      { deleteVapi: fail, deleteTwilio: fail },
    );
    assert.equal(result.ok, true);
    assert.equal(result.remotePending, 2);
    assert.equal(result.local, "scrubbed");
    assert.equal(result.provider, "pending", "local success is not reported as provider deletion");
    assert.match((await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "customer.forgotten" } })).summary, /2 provider copies are still being deleted/);
    const pendingCall = await prisma.call.findUnique({ where: { id: call.id } });
    assert.equal(pendingCall.transcript, null, "our copy goes now");
    assert.equal(pendingCall.contentPurgedAt, null);
    const pendingLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.doesNotMatch(pendingLead.notes, /Gate code/);
    assert.match(pendingLead.notes, /Recordings\/RE/);

    const vapi = [];
    await purgeExpiredCallContent({ deleteVapi: async (id) => (vapi.push(id), "deleted"), deleteTwilio: async () => "deleted" });
    assert.ok(vapi.includes(call.vapiCallId), "a forgotten call is picked up long before 24 months");
    assert.ok((await prisma.call.findUnique({ where: { id: call.id } })).contentPurgedAt);
    assert.equal(await prisma.auditEvent.count({ where: { businessId: business.id, action: "customer.provider_deletion_confirmed", entityId: call.id } }), 1);
    await purgeExpiredCallContent({ deleteVapi: async () => "deleted", deleteTwilio: async () => "deleted" });
    assert.equal(await prisma.auditEvent.count({ where: { businessId: business.id, action: "customer.provider_deletion_confirmed" } }), 1, "confirmed once");
    assert.doesNotMatch((await prisma.lead.findUnique({ where: { id: lead.id } })).notes, /Recordings\/RE/);
  } finally {
    await drop(business.id);
  }
});

test("a customer on an active plan can't be forgotten until the plan is cancelled; another shop's customer is not found", async () => {
  const business = await shop();
  const elsewhere = await shop();
  try {
    const phone = randomPhone();
    const { customer } = await customerWithHistory(business, phone);
    const plan = await prisma.servicePlan.create({ data: { businessId: business.id, name: "Comfort Club", priceCents: 1500, interval: "month" } });
    await prisma.planMember.create({ data: { businessId: business.id, planId: plan.id, phone, phoneNormalized: phone, status: "active" } });
    const params = { customerId: customer.id, actorEmail: business.ownerEmail, role: "owner" };
    assert.deepEqual(await forgetCustomer({ ...params, businessId: business.id }, { deleteVapi: null, deleteTwilio: null }), { ok: false, reason: "active_plan" });
    assert.deepEqual(await forgetCustomer({ ...params, businessId: elsewhere.id }, { deleteVapi: null, deleteTwilio: null }), { ok: false, reason: "not_found" });
    assert.ok(await prisma.customer.findUnique({ where: { id: customer.id } }));
  } finally {
    await drop(business.id);
    await drop(elsewhere.id);
  }
});

test("a sign-in is named by browser and device, and placed by city without keeping the IP", () => {
  const ua = {
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
    android: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  };
  assert.equal(deviceLabel(ua.mac), "Chrome on Mac");
  assert.equal(deviceLabel(ua.iphone), "Safari on iPhone");
  assert.equal(deviceLabel(ua.edge), "Edge on Windows");
  assert.equal(deviceLabel(ua.android), "Samsung Internet on Android");
  assert.equal(deviceLabel(null), "Unknown device");
  const h = (o) => new Headers(o);
  assert.equal(placeLabel(h({ "x-vercel-ip-city": "San%20Antonio", "x-vercel-ip-country-region": "TX" })), "San Antonio, TX");
  assert.equal(placeLabel(h({ "x-vercel-ip-country": "US" })), "US");
  assert.equal(placeLabel(h({})), null);
  assert.doesNotMatch(read("prisma/schema.prisma").match(/model SignInEvent \{[^}]+\}/)[0], /\bip\b/i);
});

test("only a device not seen in 90 days counts as new, the first sign-in never does, and old history is dropped", async () => {
  const email = `hist-${stamp()}@example.test`;
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
  const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = new Date(Date.now() - 200 * DAY);
  try {
    assert.deepEqual(await recordSignIn({ email, provider: "google", userAgent: mac, place: null, now: t0 }), { newDevice: false });
    assert.deepEqual(await recordSignIn({ email, provider: "password", userAgent: mac, place: null, now: new Date(t0.getTime() + DAY) }), { newDevice: false });
    assert.deepEqual(await recordSignIn({ email, provider: "password", userAgent: phone, place: "Austin, TX", now: new Date(t0.getTime() + 2 * DAY) }), { newDevice: true });
    const later = new Date(t0.getTime() + 150 * DAY);
    assert.deepEqual(await recordSignIn({ email, provider: "google", userAgent: mac, place: null, now: later }), { newDevice: false }, "nothing left to compare with after 90 days");
    const rows = await prisma.signInEvent.findMany({ where: { email } });
    assert.equal(rows.length, 1, "sign-ins older than 90 days are deleted");
    assert.equal(rows[0].method, "Google");
  } finally {
    await prisma.signInEvent.deleteMany({ where: { email } });
  }
});

test("each new session records its sign-in, a history failure can't block it, and the Devices list shows it", () => {
  const auth = read("src/auth.ts");
  assert.match(auth, /recordSignInSafely\(email, account\.provider\)/);
  assert.match(read("src/lib/sign-in-history.ts"), /export async function recordSignInSafely[\s\S]+?catch/);
  assert.match(read("src/app/api/account/security/route.ts"), /signIns: await recentSignIns\(email\)/);
  assert.match(read("src/components/settings-center/security-group.tsx"), /Recent sign-ins/);
});

test("researchers have a published way to report a vulnerability", async () => {
  const body = await securityTxt.GET().text();
  assert.match(body, /^Contact: mailto:\S+@orvius\.im$/m);
  const expires = new Date(body.match(/^Expires: (.+)$/m)[1]);
  assert.ok(expires > new Date() && expires < new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), "RFC 9116: under a year out");
  assert.match(body, /^Policy: \S+\/security$/m);
  const page = read("src/app/security/page.tsx");
  assert.match(page, /Reporting a vulnerability/);
  assert.match(page, /won&apos;t take legal action/);
});

test("the owner can download everything the shop holds about one customer, and nothing about anyone else", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const other = randomPhone();
    const { customer } = await customerWithHistory(business, phone);
    await customerWithHistory(business, other);
    await prisma.smsOptOut.create({ data: { businessId: business.id, phone, phoneNormalized: phone } });

    const data = await exportCustomerData({ businessId: business.id, customerId: customer.id, actorEmail: business.ownerEmail, role: "owner" });
    assert.equal(data.customer.phone, phone);
    assert.equal(data.calls.length, 1);
    assert.match(data.calls[0].transcript, /Dana Reyes/);
    assert.equal(data.requests[0].address, "14 Elm St");
    assert.equal(data.jobs[0].notes, "Dog in yard");
    assert.deepEqual(data.texts.map((t) => t.body), ["Is 3pm ok?"]);
    assert.ok(data.textingOptOut);
    assert.doesNotMatch(JSON.stringify(data), new RegExp(other.slice(2)));
    assert.doesNotMatch(JSON.stringify(data), /vapiCallId|publicToken|techToken|costMicros/);
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "customer.exported" } }));

    const elsewhere = await shop();
    try {
      assert.equal(await exportCustomerData({ businessId: elsewhere.id, customerId: customer.id, actorEmail: "x@example.test", role: "owner" }), null);
    } finally {
      await drop(elsewhere.id);
    }
    assert.equal(can("dispatcher", "data.export"), false);
    assert.match(read("src/app/api/customers/[id]/export/route.ts"), /requirePermission\("data\.export"/);
  } finally {
    await drop(business.id);
  }
});
