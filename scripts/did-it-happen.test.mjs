#!/usr/bin/env node
/*
 * "Did this actually happen?" — a press whose reply is lost, malformed or
 * repeated is answered from the shop's own record: one effect, never two, and
 * never "done" without the record saying so.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { WriteError } = await import("../src/lib/client-write.ts");
const { runCheckedWrite, checkRecord, CHECKED_NOT_DONE, COULD_NOT_CONFIRM } = await import("../src/lib/checked-write.ts");
const { bookableShop, bookingSlots, bookOnline, bookingReadBack } = await import("../src/lib/online-booking.ts");
const route = await import("../src/app/api/public/book/[slug]/route.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const ALL_DAY = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "00:00", close: "23:59" }])),
);

async function shop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Cole Heating",
      slug: `dih-${stamp()}`,
      trade: "HVAC",
      hoursJson: ALL_DAY,
      servicesJson: JSON.stringify([{ name: "Tune-up", durationMin: 60 }]),
      timezone: "America/Chicago",
      environment: "live",
      bookingPageOn: true,
      billingStatus: "active",
      ownerPhone: randomPhone(),
      ownerEmail: `owner-${stamp()}@example.test`,
      ...overrides,
    },
  });
}

const call = (handler, slug, init, qs = "") =>
  handler(new Request(`http://localhost/api/public/book/${slug}${qs}`, init), { params: Promise.resolve({ slug }) });
const post = (slug, body, ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) =>
  call(route.POST, slug, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

const counts = async (businessId) => ({
  leads: await prisma.lead.count({ where: { businessId } }),
  jobs: await prisma.job.count({ where: { businessId } }),
  alerts: await prisma.ownerNotification.count({ where: { businessId } }),
});

/* ---------- the shared client pattern ---------- */

test("checked write: a reply that names the effect is done; a refusal before acting is a plain failure", async () => {
  let reads = 0;
  const readBack = async () => (reads++, null);
  const done = await runCheckedWrite({ send: async () => ({ ok: true, id: "j1" }), accept: (d) => (d?.ok === true ? d.id : null), readBack });
  assert.deepEqual(done, { kind: "confirmed", value: "j1", via: "reply" });
  const refused = await runCheckedWrite({
    send: async () => {
      throw new WriteError("Pick another time.", false, 409, "slot_taken");
    },
    accept: () => "x",
    readBack,
  });
  assert.deepEqual(refused, { kind: "failed", message: "Pick another time.", reason: "slot_taken" });
  assert.equal(reads, 0, "nothing is read back when the answer was certain");
});

test("checked write: lost or malformed replies read the record back — done, provably not done, or unknown", async () => {
  const lost = async () => {
    throw new WriteError("no answer", true, null);
  };
  let checking = 0;
  const onChecking = () => checking++;
  assert.deepEqual(await runCheckedWrite({ send: lost, accept: () => null, readBack: async () => "j9", onChecking }), {
    kind: "confirmed",
    value: "j9",
    via: "record",
  });
  assert.deepEqual(await runCheckedWrite({ send: async () => ({ ok: true }), accept: () => null, readBack: async () => "absent", onChecking }), {
    kind: "not_done",
    message: CHECKED_NOT_DONE,
  });
  assert.deepEqual(await runCheckedWrite({ send: lost, accept: () => null, readBack: async () => null, onChecking }), {
    kind: "unknown",
    message: COULD_NOT_CONFIRM,
  });
  assert.deepEqual(
    await runCheckedWrite({
      send: lost,
      accept: () => null,
      readBack: async () => {
        throw new Error("offline");
      },
      onChecking,
    }),
    { kind: "unknown", message: COULD_NOT_CONFIRM },
  );
  assert.equal(checking, 4, "every uncertain press says it is checking");
});

test("checked write: a read-back that never answers ends as unknown, not a control stuck on", async () => {
  const started = Date.now();
  const result = await checkRecord(() => new Promise(() => {}), 50);
  assert.equal(result.kind, "unknown");
  assert.ok(Date.now() - started < 2_000);
});

/* ---------- public booking ---------- */

test("booking: the same key pressed twice is one lead, one job, one owner alert — the second reply is the first booking", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const [slot] = await bookingSlots(live, "Tune-up");
    const key = `k-${stamp()}`;
    const input = { serviceType: "Tune-up", at: slot.at, name: "Ann Cole", phone: randomPhone(), bookingKey: key };
    const first = await bookOnline(live, input);
    assert.equal(first.ok, true, JSON.stringify(first));
    const afterFirst = await counts(business.id);
    assert.equal(afterFirst.jobs, 1);
    assert.ok(afterFirst.alerts >= 1);
    const again = await bookOnline(live, input);
    assert.equal(again.ok, true);
    assert.equal(again.jobId, first.jobId);
    assert.equal(again.label, first.label);
    assert.equal(again.replayed, true);
    assert.deepEqual(await counts(business.id), afterFirst, "the replay added no lead, job or alert");
    const job = await prisma.job.findUniqueOrThrow({ where: { id: first.jobId } });
    assert.equal(job.scheduledAt.toISOString(), slot.at, "the slot never moves on replay");
  } finally {
    await drop(business.id);
  }
});

test("booking: two copies of one press racing still make one booking", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const [slot] = await bookingSlots(live, "Tune-up");
    const input = { serviceType: "Tune-up", at: slot.at, name: "Bo Diaz", phone: randomPhone(), bookingKey: `race-${stamp()}` };
    const results = await Promise.all([bookOnline(live, input), bookOnline(live, input)]);
    const booked = results.filter((r) => r.ok);
    assert.equal(booked.length, 2, `both copies report the one booking, neither says "received": ${JSON.stringify(results)}`);
    assert.equal(new Set(booked.map((r) => r.jobId)).size, 1);
    const c = await counts(business.id);
    assert.equal(c.leads, 1);
    assert.equal(c.jobs, 1);
  } finally {
    await drop(business.id);
  }
});

test("booking read-back: none before, booked after, scoped to the shop the key was made on", async () => {
  const business = await shop();
  const other = await shop();
  try {
    const live = await bookableShop(business.slug);
    const [slot] = await bookingSlots(live, "Tune-up");
    const key = `rb-${stamp()}`;
    assert.equal((await bookingReadBack(live, key)).reason, "none");
    const res0 = await call(route.GET, business.slug, undefined, `?booking=${key}`);
    assert.equal((await res0.json()).booking.reason, "none");

    const res = await post(business.slug, { serviceType: "Tune-up", at: slot.at, name: "Cy Ruiz", phone: randomPhone(), bookingKey: key });
    assert.equal(res.status, 200);
    const reply = await res.json();
    assert.equal(reply.ok, true);

    const back = (await (await call(route.GET, business.slug, undefined, `?booking=${key}`)).json()).booking;
    assert.equal(back.ok, true);
    assert.equal(back.jobId, reply.jobId);
    assert.equal(back.label, reply.label);
    const elsewhere = (await (await call(route.GET, other.slug, undefined, `?booking=${key}`)).json()).booking;
    assert.equal(elsewhere.reason, "none", "another shop's page can't read this booking");
  } finally {
    await drop(business.id);
    await drop(other.id);
  }
});

test("booking: a lead kept after the slot went reads back as received, never as booked", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const key = `rcv-${stamp()}`;
    await prisma.lead.create({ data: { businessId: business.id, externalId: `web-booking:${key}`, name: "Di Park", phone: randomPhone(), source: "web", status: "new" } });
    const back = await bookingReadBack(live, key);
    assert.equal(back.ok, false);
    assert.equal(back.reason, "received");
    const [slot] = await bookingSlots(live, "Tune-up");
    const res = await post(business.slug, { serviceType: "Tune-up", at: slot.at, name: "Di Park", phone: randomPhone(), bookingKey: key });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).reason, "received");
    assert.deepEqual(await counts(business.id), { leads: 1, jobs: 0, alerts: 0 }, "the replay made nothing new");
  } finally {
    await drop(business.id);
  }
});

test("booking: a malformed key is refused before anything is written", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const [slot] = await bookingSlots(live, "Tune-up");
    const res = await post(business.slug, { serviceType: "Tune-up", at: slot.at, name: "Ed Moss", phone: randomPhone(), bookingKey: "bad key!" });
    assert.equal(res.status, 400);
    assert.deepEqual(await counts(business.id), { leads: 0, jobs: 0, alerts: 0 });
  } finally {
    await drop(business.id);
  }
});

test("booking: the service area is honored — out of area and missing ZIP are refused, no list means no refusal", async () => {
  const fenced = await shop({ serviceZipsJson: JSON.stringify(["60601", "60602"]) });
  const open = await shop();
  try {
    const live = await bookableShop(fenced.slug);
    const [slot] = await bookingSlots(live, "Tune-up");
    const base = { serviceType: "Tune-up", at: slot.at, name: "Flo Hart", phone: randomPhone() };

    const outside = await bookOnline(live, { ...base, address: "1 Main St, Gary IN 46402" });
    assert.equal(outside.reason, "out_of_area");
    assert.match(outside.message, /outside the area/);
    const noZip = await bookOnline(live, { ...base, address: "" });
    assert.equal(noZip.reason, "out_of_area");
    assert.match(noZip.message, /ZIP/);
    assert.deepEqual(await counts(fenced.id), { leads: 0, jobs: 0, alerts: 0 }, "a refusal writes nothing");

    const inside = await bookOnline(live, { ...base, address: "200 E Randolph St, Chicago IL 60601" });
    assert.equal(inside.ok, true, JSON.stringify(inside));
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: inside.jobId } })).scheduledAt.toISOString(), slot.at);

    const openLive = await bookableShop(open.slug);
    const [openSlot] = await bookingSlots(openLive, "Tune-up");
    const anywhere = await bookOnline(openLive, { ...base, at: openSlot.at, address: "" });
    assert.equal(anywhere.ok, true, "no allowlist set: the page doesn't invent one");
  } finally {
    await drop(fenced.id);
    await drop(open.id);
  }
});

/* ---------- lead follow-up ---------- */

const { sendLeadFollowUp, previewFollowUp, FOLLOW_UP_UNCERTAIN } = await import("../src/lib/lead-follow-up.ts");
const AFTERNOON = new Date("2026-09-29T19:00:00Z");

async function followUpLead() {
  const business = await prisma.business.create({
    data: { name: "Cole Heating", slug: `dfu-${stamp()}`, trade: "HVAC", hoursJson: "{}", servicesJson: "[]", timezone: "America/Chicago", vapiPhoneNumber: randomPhone(), followUpMode: "ask", environment: "live" },
  });
  const phone = randomPhone();
  const row = await prisma.lead.create({
    data: { businessId: business.id, name: "Ann Cole", phone, serviceType: "AC not cooling", urgency: "this-week", status: "new", createdAt: new Date(AFTERNOON.getTime() - 4 * 3_600_000) },
  });
  return { business, row };
}

test("follow-up: the send carries an intent, so the ledger knows which lead it was for", async () => {
  const { business, row } = await followUpLead();
  try {
    const calls = [];
    const result = await sendLeadFollowUp({
      businessId: business.id,
      leadId: row.id,
      by: { actor: "owner", actorEmail: "o@example.test" },
      now: AFTERNOON,
      send: async (p) => (calls.push(p), { sent: true, sid: "SM1" }),
    });
    assert.equal(result.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].intent.eventType, "lead.follow_up");
    assert.equal(calls[0].intent.eventId, row.id);
    assert.equal(calls[0].intent.severity, "routine");
  } finally {
    await drop(business.id);
  }
});

test("follow-up: a send that may have left keeps the claim — no second text from a tap or the cron", async () => {
  const { business, row } = await followUpLead();
  try {
    let attempts = 0;
    const timeout = async () => {
      attempts++;
      throw new Error("socket hang up");
    };
    const by = { actor: "owner", actorEmail: "o@example.test" };
    const first = await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: timeout });
    assert.deepEqual(first, { sent: false, reason: FOLLOW_UP_UNCERTAIN, uncertain: true });
    assert.ok((await prisma.lead.findUniqueOrThrow({ where: { id: row.id } })).followUpSentAt, "the stamp stays");
    const again = await sendLeadFollowUp({ businessId: business.id, leadId: row.id, by, now: AFTERNOON, send: timeout });
    assert.equal(again.sent, false);
    assert.equal(attempts, 1, "the second press never reached the provider");
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "lead.follow_up_unknown" } }));

    await prisma.smsIntent.create({
      data: { businessId: business.id, eventType: "lead.follow_up", eventId: row.id, recipientNormalized: row.phone, channel: "sms", audience: "customer", messageVersion: 1, status: "unknown_submission" },
    });
    const preview = await previewFollowUp(business.id, row.id, AFTERNOON);
    assert.equal(preview.uncertain, true);
    assert.equal(preview.canSend, false);
  } finally {
    await drop(business.id);
  }
});

test("the call page dials the number it shows: the request's checked callback, withheld when there is none", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/dashboard/calls/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const phone = call\.lead \? call\.lead\.phone : call\.callerPhone;/);
  assert.match(page, /href=\{`tel:\$\{phone\}`\}/);
  assert.doesNotMatch(page, /tel:\$\{call\.callerPhone\}/, "the button never dials raw caller ID over the checked number");
});

test("removing a job photo keeps which photo it was, once, on the job's history; another shop can't remove it", async () => {
  const { deleteJobPhoto } = await import("../src/lib/job-field.ts");
  const business = await shop();
  const other = await shop();
  try {
    const job = await prisma.job.create({ data: { businessId: business.id, title: "No heat", status: "scheduled" } });
    const photo = await prisma.jobPhoto.create({
      data: { businessId: business.id, jobId: job.id, kind: "before", mime: "image/png", bytes: Buffer.from([1, 2, 3]), sizeBytes: 3, takenBy: "Dana", caption: "Furnace panel" },
    });
    await assert.rejects(deleteJobPhoto(other.id, job.id, photo.id), /not found/i);
    assert.equal(await prisma.jobPhoto.count({ where: { id: photo.id } }), 1);
    const removed = await deleteJobPhoto(business.id, job.id, photo.id);
    assert.deepEqual([removed.id, removed.kind, removed.takenBy, removed.caption, removed.sizeBytes], [photo.id, "before", "Dana", "Furnace panel", 3]);
    await assert.rejects(deleteJobPhoto(business.id, job.id, photo.id), /not found/i, "a replayed removal says it's gone");
    const route = await import("../src/app/api/jobs/[id]/photos/[photoId]/route.ts");
    assert.match(String(route.DELETE), /detail: \{ removed \}/);
  } finally {
    await drop(business.id);
    await drop(other.id);
  }
});
