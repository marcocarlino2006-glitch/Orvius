#!/usr/bin/env node
/*
 * One scheduling policy per shop, including travel. Disposable database, no
 * providers: legacy shops unchanged, new shops hold for the owner, an
 * owner-chosen gap is enforced on every booking path, and an override needs
 * authority and a reason and leaves a full record.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const policyLib = await import("../src/lib/scheduling-policy.ts");
const { slotHasRoom } = await import("../src/lib/tech-hours.ts");
const { findOpenSlots, ownerScheduleClash } = await import("../src/lib/job.ts");
const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { OWNER_SETS_TIMES_REPLY } = await import("../src/lib/in-call-tool-defs.ts");
const { bookingServices, bookingSlots, bookOnline } = await import("../src/lib/online-booking.ts");
const { grantableAction, decideApproval } = await import("../src/lib/command-authority.ts");
const policyRoute = await import("../src/app/api/scheduling-policy/route.ts");
const jobRoute = await import("../src/app/api/jobs/[id]/route.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const { policyFromRow, parsePolicyInput, adjacentJobs, holdsForApproval, SCHEDULING_POLICY_VERSION } = policyLib;

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const DAY = 24 * 60 * 60_000;
/** Noon UTC two days out (early morning in Chicago), so every test slot is in the future, in the window and on one shop day. */
const base = new Date(Math.floor((Date.now() + 2 * DAY) / DAY) * DAY + 12 * 3_600_000);
const ALL_DAY = JSON.stringify(Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "00:00", close: "23:59" }])));
const at = (minutes) => new Date(base.getTime() + minutes * 60_000);

async function makeShop(policy) {
  const shop = await prisma.business.create({
    data: {
      name: "Policy HVAC",
      slug: `policy-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: ALL_DAY,
      servicesJson: "[]",
      timezone: "America/Chicago",
      billingStatus: "active",
      billingPlan: "pro",
      bookingMode: "book",
      bookingPageOn: true,
      ownerEmail: `owner-${uid()}@example.test`,
      ...(policy ? { operatingPolicy: { create: policy } } : {}),
    },
  });
  made.push(shop.id);
  return shop;
}

const job = (shop, data) =>
  prisma.job.create({ data: { businessId: shop.id, title: "Visit", serviceType: "AC repair", status: "scheduled", durationMin: 60, ...data } });

test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
});

test("no row is a legacy shop with no travel claim; a row starts not_configured and holds bookings", () => {
  assert.deepEqual(policyFromRow(null), { state: "legacy_no_travel_policy", gapMin: 0, version: 0, remoteCompletionAllowed: false });
  const fresh = policyFromRow({ travelMode: "not_configured", travelGapMin: null, version: 1, remoteCompletionAllowed: false });
  assert.equal(fresh.state, "not_configured");
  assert.equal(holdsForApproval(fresh), true);
  assert.equal(holdsForApproval(policyFromRow(null)), false, "a legacy shop keeps booking as it did");
  assert.equal(policyFromRow({ travelMode: "min_gap", travelGapMin: 0, version: 2, remoteCompletionAllowed: false }).state, "not_configured", "a gap of 0 is not a min_gap");
});

test("the owner picks 0 or a whole positive gap; nothing is filled in for them", () => {
  assert.deepEqual(parsePolicyInput({ mode: "duration_only" }), { travelMode: "duration_only", travelGapMin: null });
  assert.deepEqual(parsePolicyInput({ mode: "min_gap", gapMin: 30 }), { travelMode: "min_gap", travelGapMin: 30 });
  for (const bad of [{}, { mode: "min_gap" }, { mode: "min_gap", gapMin: 0 }, { mode: "min_gap", gapMin: 12.5 }, { mode: "min_gap", gapMin: 999 }, { mode: "eta" }]) {
    assert.ok("error" in parsePolicyInput(bad), JSON.stringify(bad));
  }
});

test("only the immediately preceding and following jobs are checked against the gap", () => {
  const jobs = [
    { id: "early", scheduledAt: at(-300), durationMin: 60 },
    { id: "prev", scheduledAt: at(-90), durationMin: 60 },
    { id: "next", scheduledAt: at(100), durationMin: 60 },
    { id: "later", scheduledAt: at(400), durationMin: 60 },
  ];
  const check = adjacentJobs({ start: at(0), durationMin: 60, gapMin: 45, jobs });
  assert.equal(check.beforeJobId, "prev");
  assert.equal(check.afterJobId, "next");
  assert.equal(check.gapBeforeMin, 30);
  assert.equal(check.gapAfterMin, 40);
  assert.equal(check.short, true);
  assert.equal(adjacentJobs({ start: at(0), durationMin: 60, gapMin: 30, jobs }).short, false);
  assert.equal(adjacentJobs({ start: at(0), durationMin: 60, gapMin: 0, jobs }).short, false, "duration only never flags travel");
});

test("a gap uses up the technician around their job in the room count", () => {
  const pool = [{ id: "ana", hoursJson: "{}" }];
  const booked = [{ scheduledAt: at(0), durationMin: 60, technicianId: "ana" }];
  const args = { pool, booked, start: at(70), durationMin: 60, timezone: "UTC" };
  assert.equal(slotHasRoom(args), true);
  assert.equal(slotHasRoom({ ...args, gapMin: 30 }), false);
  assert.equal(slotHasRoom({ ...args, gapMin: 10 }), true);
});

test("slot search offers a time right after a job for duration-only, and not inside a min gap", async () => {
  const durationOnly = await makeShop({ travelMode: "duration_only" });
  const gap = await makeShop({ travelMode: "min_gap", travelGapMin: 45 });
  for (const shop of [durationOnly, gap]) {
    const ana = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
    await job(shop, { technicianId: ana.id, scheduledAt: at(0), durationMin: 60 });
  }
  const params = (shop) => ({ businessId: shop.id, urgency: null, durationMin: 60, skill: "general", hoursJson: ALL_DAY, timezone: "America/Chicago" });
  assert.equal((await findOpenSlots(params(durationOnly), { count: 1, onlyAt: at(60) })).length, 1);
  assert.equal((await findOpenSlots(params(gap), { count: 1, onlyAt: at(60) })).length, 0);
  assert.equal((await findOpenSlots(params(gap), { count: 1, onlyAt: at(120) })).length, 1);
});

test("a shop that hasn't chosen yet: the voice agent and the booking page take details instead of promising a time", async () => {
  const shop = await makeShop({ travelMode: "not_configured" });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `vc-${uid()}`, status: "in-progress" } });
  const tools = { id: shop.id, name: shop.name, hoursJson: ALL_DAY, timezone: shop.timezone, trade: shop.trade, servicesJson: "[]", bookingMode: "book" };
  const [offer, hold] = await handleInCallToolCalls({
    shop: tools,
    callId: call.id,
    toolCalls: [
      { id: "a", name: "check_availability", args: { serviceType: "AC repair" } },
      { id: "b", name: "hold_appointment", args: { slot: at(0).toISOString(), serviceType: "AC repair" } },
    ],
  });
  assert.equal(offer.result, OWNER_SETS_TIMES_REPLY);
  assert.equal(hold.result, OWNER_SETS_TIMES_REPLY);
  assert.equal((await prisma.call.findUnique({ where: { id: call.id } })).heldSlotAt, null);

  const full = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
  assert.deepEqual(await bookingSlots(full, "AC repair"), []);
  const result = await bookOnline(full, { serviceType: bookingServices(full)[0], at: at(0).toISOString(), name: "Pat", phone: "+13125550123" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "owner_sets_times");
  assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 0);
});

test("a legacy shop keeps booking exactly as before, and nothing writes a policy row for it", async () => {
  const shop = await makeShop(null);
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `vc-${uid()}`, status: "in-progress" } });
  const [offer] = await handleInCallToolCalls({
    shop: { id: shop.id, name: shop.name, hoursJson: ALL_DAY, timezone: shop.timezone, trade: shop.trade, servicesJson: "[]", bookingMode: "book" },
    callId: call.id,
    toolCalls: [{ id: "a", name: "check_availability", args: { serviceType: "AC repair" } }],
  });
  assert.match(offer.result, /\[slot /);
  assert.equal(await prisma.shopOperatingPolicy.count({ where: { businessId: shop.id } }), 0);
});

test("the owner's clash check names a too-close neighbour for the assigned tech", async () => {
  const shop = await makeShop({ travelMode: "min_gap", travelGapMin: 30 });
  const ana = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
  await job(shop, { technicianId: ana.id, scheduledAt: at(0), durationMin: 60 });
  const clash = await ownerScheduleClash({ businessId: shop.id, at: at(70), durationMin: 60, skill: "general", timezone: "America/Chicago", technicianId: ana.id });
  assert.match(clash, /Ana would start 10 min after their previous job; your policy is at least 30 min/);
  assert.equal(await ownerScheduleClash({ businessId: shop.id, at: at(90), durationMin: 60, skill: "general", timezone: "America/Chicago", technicianId: ana.id }), null);
});

test("schedule_override is grantable on its own; it never approves a Command plan", () => {
  assert.equal(grantableAction("schedule_override"), true);
  const grant = { id: "g", granteeEmail: "d@x.test", action: "schedule_override", conditionsJson: "{}", expiresAt: new Date(Date.now() + DAY), policyVersion: "command-authority-1", revokedAt: null };
  const decision = decideApproval({ actor: { role: "dispatcher", email: "d@x.test" }, proposal: { action: "schedule_override", proposedByEmail: null }, grants: [grant] });
  assert.equal(decision.ok, false);
});

test("only the owner sets the policy; each change bumps the version and is audited before/after", async () => {
  const shop = await makeShop({ travelMode: "not_configured" });
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });
  const put = (body) => policyRoute.PUT(new Request("http://x/api/scheduling-policy", { method: "PUT", body: JSON.stringify(body) }));

  signedInAs = manager;
  assert.equal((await put({ mode: "duration_only" })).status, 403);
  signedInAs = shop.ownerEmail;
  assert.equal((await put({ mode: "min_gap" })).status, 422, "no gap is invented when the owner didn't give one");
  const res = await put({ mode: "min_gap", gapMin: 20 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).policy.state, "min_gap");
  const row = await prisma.shopOperatingPolicy.findUnique({ where: { businessId: shop.id } });
  assert.equal(row.version, 2);
  assert.equal(row.updatedByEmail, shop.ownerEmail);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "scheduling_policy.updated" } });
  const detail = JSON.parse(audit.detailJson);
  assert.equal(detail.before.state, "not_configured");
  assert.deepEqual(detail.after, { state: "min_gap", gapMin: 20, version: 2 });
  signedInAs = null;
});

test("moving a job over the gap: a dispatcher needs a grant, everyone needs a reason, and the record is complete", async () => {
  const shop = await makeShop({ travelMode: "min_gap", travelGapMin: 30 });
  const dispatcher = `disp-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  const ana = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
  const prev = await job(shop, { technicianId: ana.id, scheduledAt: at(0), durationMin: 60 });
  const next = await job(shop, { technicianId: ana.id, scheduledAt: at(240), durationMin: 60 });
  const moving = await job(shop, { technicianId: ana.id, scheduledAt: at(600), durationMin: 60 });
  const patch = (body) =>
    jobRoute.PATCH(new Request(`http://x/api/jobs/${moving.id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: moving.id }) });
  const target = at(70).toISOString();

  signedInAs = dispatcher;
  const asked = await patch({ scheduledAt: target });
  assert.equal(asked.status, 409);
  assert.match((await asked.json()).error, /your policy is at least 30 min/);
  assert.equal((await patch({ scheduledAt: target, allowClash: true, reason: "Customer insists" })).status, 403);

  signedInAs = shop.ownerEmail;
  const noReason = await patch({ scheduledAt: target, allowClash: true });
  assert.equal(noReason.status, 422);
  assert.equal((await noReason.json()).needsReason, true);
  assert.equal((await prisma.job.findUnique({ where: { id: moving.id } })).scheduledAt.getTime(), moving.scheduledAt.getTime(), "nothing moved");

  const ok = await patch({ scheduledAt: target, allowClash: true, reason: "Same building as the previous job" });
  assert.equal(ok.status, 200);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "job.schedule_override", entityId: moving.id } });
  const detail = JSON.parse(audit.detailJson);
  assert.equal(detail.policyVersion, SCHEDULING_POLICY_VERSION);
  assert.deepEqual(detail.policy, { state: "min_gap", gapMin: 30, version: 1 });
  assert.deepEqual(detail.actor, { role: "owner", email: shop.ownerEmail });
  assert.deepEqual(detail.authority, { kind: "owner", grantId: null });
  assert.equal(detail.reason, "Same building as the previous job");
  assert.deepEqual(detail.before, { at: moving.scheduledAt.toISOString(), technicianId: ana.id });
  assert.deepEqual(detail.after, { at: target, technicianId: ana.id });
  assert.equal(detail.adjacent.beforeJobId, prev.id);
  assert.equal(detail.adjacent.afterJobId, next.id);
  assert.equal(detail.adjacent.gapBeforeMin, 10);
  assert.deepEqual(Object.keys(detail.sourceFreshness).sort(), ["busyCalendarConnected", "busyCalendarSyncedAt", "fsmScheduleSource", "fsmScheduleSyncedAt"]);
  assert.deepEqual(detail.notify, { customer: "reconfirm_new_time", technician: "moved_text" });
  signedInAs = null;
});

test("a new shop is provisioned as not_configured by the setup sandbox", async () => {
  const { startSetup } = await import("../src/lib/setup-sandbox.ts");
  const shop = await startSetup(`sandbox-${uid()}@example.test`, { name: "Fresh Shop", trade: "HVAC" });
  made.push(shop.id);
  assert.equal((await policyLib.getSchedulingPolicy(shop.id)).state, "not_configured");
});
