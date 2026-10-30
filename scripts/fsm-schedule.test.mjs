#!/usr/bin/env node
/*
 * Jobs a shop books in Jobber, Housecall Pro or ServiceTitan take a person's
 * time just like Orvius's own: a caller is never offered a time already booked
 * there, Orvius's own jobs copied over are not counted twice, and a schedule
 * that stops reading stops the offering of times instead of guessing.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.ORVIUS_TOKEN_KEY = "test-token-key-0123456789abcdef-0123456789";
process.env.SERVICETITAN_APP_KEY = "ak1.test-app-key";
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY"]) delete process.env[key];

const { sealSecret } = await import("../src/lib/secret-box.ts");
const { refreshFsmSchedule, getExternalSchedule, isFsmScheduleUnreadable } = await import("../src/lib/fsm-schedule.ts");
const { findOpenSlots, createJobFromLead, SlotTakenError } = await import("../src/lib/job.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const TZ = "America/Chicago";
const WEEK = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "08:00", close: "18:00" }])),
);

const fake = { hcpJobs: [], jobberVisits: [], stAppointments: [], fail: false, jobberQueries: [] };
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (fake.fail) return send(503, { message: "down" });
  const url = new URL(req.url, "http://fake.local");
  if (req.method === "GET" && url.pathname === "/jobs") return send(200, { jobs: fake.hcpJobs, page: 1, total_pages: 1 });
  if (req.method === "POST" && url.pathname === "/api/graphql") {
    const body = JSON.parse(raw);
    fake.jobberQueries.push(body);
    return send(200, { data: { visits: { nodes: fake.jobberVisits, pageInfo: { hasNextPage: false, endCursor: null } } } });
  }
  if (req.method === "POST" && url.pathname === "/connect/token") return send(200, { access_token: "st-token", expires_in: 900 });
  if (req.method === "GET" && /^\/jpm\/v2\/tenant\/[^/]+\/appointments$/.test(url.pathname)) {
    return send(200, { data: fake.stAppointments, hasMore: false });
  }
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.HOUSECALL_API_BASE = base;
  process.env.JOBBER_API_BASE = base;
  process.env.SERVICETITAN_API_BASE = base;
});
test.after(async () => {
  server.close();
  await prisma.$disconnect();
});
test.beforeEach(() => Object.assign(fake, { hcpJobs: [], jobberVisits: [], stAppointments: [], fail: false, jobberQueries: [] }));

async function shopWith(provider) {
  const business = await prisma.business.create({
    data: { name: "Outside Air", slug: `fsm-${stamp()}`, environment: "test", timezone: TZ, hoursJson: WEEK, servicesJson: "[]" },
  });
  await prisma.technician.create({ data: { businessId: business.id, name: "Ray" } });
  if (provider === "housecall") {
    await prisma.housecallConnection.create({ data: { businessId: business.id, apiKeyEnc: sealSecret("hcp_key_0123456789abcdef") } });
  } else if (provider === "jobber") {
    await prisma.jobberConnection.create({
      data: {
        businessId: business.id,
        accountId: "acct-1",
        accessTokenEnc: sealSecret("at-1"),
        refreshTokenEnc: sealSecret("rt-1"),
        accessExpiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  } else {
    await prisma.serviceTitanConnection.create({
      data: { businessId: business.id, tenantId: "T1", clientId: "cid", clientSecretEnc: sealSecret("secret"), providerId: "p1" },
    });
  }
  return business;
}

const slotParams = (business) => ({ businessId: business.id, urgency: "routine", durationMin: 120, skill: "general", hoursJson: WEEK, timezone: TZ });
const iso = (d) => d.toISOString();
const plus = (d, min) => new Date(d.getTime() + min * 60_000);

test("a Housecall Pro job takes the only technician's time, and a cancelled one does not", async () => {
  const business = await shopWith("housecall");
  try {
    const open = await findOpenSlots(slotParams(business), { count: 40 });
    const free = open[0];
    assert.ok(free);
    // A real open slot on a later day, not free + 24h: across a clock change that lands outside hours.
    const nextDay = open.find((slot) => slot.getTime() >= free.getTime() + 20 * 3_600_000);
    assert.ok(nextDay);
    fake.hcpJobs = [
      { id: "j1", work_status: "scheduled", schedule: { scheduled_start: iso(free), scheduled_end: iso(plus(free, 120)) }, customer: { mobile_number: "5125550100" } },
      { id: "j2", work_status: "pro canceled", schedule: { scheduled_start: iso(nextDay), scheduled_end: iso(plus(nextDay, 120)) } },
    ];
    const result = await refreshFsmSchedule(business.id);
    assert.deepEqual(result, { source: "housecall", error: null, count: 1 });
    assert.deepEqual(await findOpenSlots(slotParams(business), { count: 1, onlyAt: free }), [], "not offered over the Housecall Pro job");
    assert.equal((await findOpenSlots(slotParams(business), { count: 1, onlyAt: nextDay })).length, 1, "the cancelled job frees its time");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("Orvius's own job copied into Jobber is not counted twice; a finished visit is ignored", async () => {
  const business = await shopWith("jobber");
  try {
    const [free] = await findOpenSlots(slotParams(business), { count: 1 });
    const phone = randomPhone();
    const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Ann", phone, phoneNormalized: phone } });
    await prisma.job.create({ data: { businessId: business.id, customerId: customer.id, title: "Ours", status: "scheduled", scheduledAt: free, durationMin: 120 } });
    fake.jobberVisits = [
      { id: "v1", startAt: iso(plus(free, 10)), endAt: iso(plus(free, 130)), isComplete: false, client: { phones: [{ number: phone }] } },
      { id: "v2", startAt: iso(plus(free, 24 * 60)), endAt: iso(plus(free, 26 * 60)), isComplete: true, client: { phones: [] } },
      { id: "v3", startAt: iso(plus(free, 48 * 60)), endAt: iso(plus(free, 50 * 60)), isComplete: false, client: { phones: [{ number: "+15125550199" }] } },
    ];
    const result = await refreshFsmSchedule(business.id);
    assert.equal(result.count, 1, "only the visit that isn't ours and isn't done");
    assert.ok(fake.jobberQueries[0].variables.filter.startAt.after, "asks Jobber for a date range");
    const { booked } = await getExternalSchedule(business.id);
    assert.equal(booked[0].scheduledAt.getTime(), plus(free, 48 * 60).getTime());
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the final booking check refuses a promised time booked in ServiceTitan", async () => {
  const business = await shopWith("servicetitan");
  try {
    const [free] = await findOpenSlots(slotParams(business), { count: 1 });
    fake.stAppointments = [
      { id: 1, start: iso(free), end: iso(plus(free, 120)), status: "Scheduled" },
      { id: 2, start: iso(plus(free, 24 * 60)), end: iso(plus(free, 26 * 60)), status: "Canceled" },
    ];
    assert.equal((await refreshFsmSchedule(business.id)).count, 1);
    const lead = await prisma.lead.create({ data: { businessId: business.id, phone: randomPhone(), status: "new" } });
    await assert.rejects(
      createJobFromLead({ leadId: lead.id, scheduledAt: free, enforceCapacity: true, skipAutoAssign: true }),
      (error) => error instanceof SlotTakenError,
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a schedule that worked and then can't be read stops times being offered and tells the owner", async () => {
  const business = await shopWith("housecall");
  try {
    await prisma.business.update({ where: { id: business.id }, data: { ownerPhone: "+15125550123", ownerEmail: "owner@example.com" } });
    assert.equal((await refreshFsmSchedule(business.id)).error, null);
    await prisma.business.update({ where: { id: business.id }, data: { fsmScheduleSyncedAt: new Date(Date.now() - 3 * 3_600_000) } });
    fake.fail = true;
    const { blocked } = await getExternalSchedule(business.id);
    assert.equal(blocked.length, 1, "the whole horizon is blocked");
    assert.equal(await isFsmScheduleUnreadable(business.id), true);
    assert.deepEqual(await findOpenSlots(slotParams(business), { count: 1 }), []);
    const row = await prisma.business.findUnique({ where: { id: business.id }, select: { fsmScheduleError: true } });
    assert.match(row.fsmScheduleError, /503/);
    assert.ok(await prisma.ownerNotification.count({ where: { businessId: business.id, dedupeKey: { startsWith: "fsm-schedule-unreadable:" } } }));
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a connected schedule that has never been read is unknown, not free, until the first read succeeds", async () => {
  const business = await shopWith("housecall");
  try {
    fake.fail = true;
    // Connected, no read yet: the first read is tried on the spot and its failure blocks the horizon.
    const unread = await getExternalSchedule(business.id);
    assert.equal(unread.blocked.length, 1, "nothing is offered as open");
    assert.equal(await isFsmScheduleUnreadable(business.id), true);
    assert.deepEqual(await findOpenSlots(slotParams(business), { count: 1 }), []);
    const result = await refreshFsmSchedule(business.id);
    assert.ok(result.error);
    assert.equal((await getExternalSchedule(business.id)).blocked.length, 1, "a failed first read stays unknown");

    fake.fail = false;
    const read = await getExternalSchedule(business.id);
    assert.deepEqual(read.blocked, [], "the first successful read is the answer");
    assert.equal(await isFsmScheduleUnreadable(business.id), false);
    assert.equal((await findOpenSlots(slotParams(business), { count: 1 })).length, 1);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a disconnected schedule blocks nothing", async () => {
  const business = await prisma.business.create({
    data: { name: "No FSM", slug: `nofsm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, hoursJson: "{}", servicesJson: "[]", timezone: "America/Chicago" },
  });
  try {
    assert.deepEqual(await getExternalSchedule(business.id), { booked: [], blocked: [] });
    assert.equal(await isFsmScheduleUnreadable(business.id), false);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});
