#!/usr/bin/env node
/*
 * Review requests: a finished visit gets one text with the shop's review
 * link — same link for everyone, once per customer a season, daytime only,
 * never past a STOP, never for a visit where no work was done.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { normalizeReviewUrl, reviewBlock, reviewMessage, runReviewRequests, sendReviewRequest, REVIEW_PER_PHONE_GAP_MS } =
  await import("../src/lib/review-requests.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
/* 2pm in Chicago. */
const AFTERNOON = new Date("2026-09-29T19:00:00Z");
const hoursBefore = (h) => new Date(AFTERNOON.getTime() - h * 3_600_000);
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

function fakeSms() {
  const sent = [];
  return {
    sent,
    send: async (params) => {
      sent.push(params);
      return { sent: true, sid: `SM${sent.length}` };
    },
  };
}

async function shop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Luxe Hair Studio",
      slug: `rv-${stamp()}`,
      trade: "Salon",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      environment: "live",
      reviewUrl: "https://g.page/r/luxe-hair/review",
      ...overrides,
    },
  });
}

async function visit(business, { phone = randomPhone(), name = "Ann Cole", completedHoursAgo = 3, ...data } = {}) {
  const customer = await prisma.customer.upsert({
    where: { businessId_phoneNormalized: { businessId: business.id, phoneNormalized: phone } },
    create: { businessId: business.id, name, phone, phoneNormalized: phone },
    update: {},
  });
  return prisma.job.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      title: "Color and cut",
      status: "completed",
      completedAt: hoursBefore(completedHoursAgo),
      resolutionCode: "maintenance",
      ...data,
    },
  });
}

test("the review link must be a real review site", () => {
  assert.deepEqual(normalizeReviewUrl("g.page/r/abc/review"), { ok: true, url: "https://g.page/r/abc/review" });
  assert.equal(normalizeReviewUrl("https://www.google.com/maps/place/x").ok, true);
  assert.equal(normalizeReviewUrl("https://www.yelp.com/writeareview/biz/x").ok, true);
  assert.equal(normalizeReviewUrl("http://g.page/r/abc").ok, false, "https only");
  assert.equal(normalizeReviewUrl("https://evil.example/phish").ok, false);
  assert.equal(normalizeReviewUrl("https://google.com.evil.example/").ok, false);
  assert.equal(normalizeReviewUrl("https://google.co.evil/").ok, false);
  assert.equal(normalizeReviewUrl("https://www.google.co.uk/maps").ok, true);
  assert.equal(normalizeReviewUrl("https://notgoogle.com/").ok, false);
  assert.equal(normalizeReviewUrl("not a url at all").ok, false);
});

test("the text: thanks, one ask, the link, a way out", () => {
  const body = reviewMessage({ businessName: "Luxe Hair Studio", name: "Ann Cole", reviewUrl: "https://g.page/r/x/review" });
  assert.equal(
    body,
    "Hi Ann, thanks for choosing Luxe Hair Studio. Would you take a minute to leave us a review? It really helps a small business: https://g.page/r/x/review Reply STOP to opt out.",
  );
  assert.match(reviewMessage({ businessName: "Luxe", name: null, reviewUrl: "u" }), /^Thanks for choosing Luxe\./);
  assert.ok(body.length <= 320);
});

test("which visits get one", () => {
  const base = { status: "completed", completedAt: hoursBefore(3), resolutionCode: "repaired", reviewRequestedAt: null, phone: "+15125550101" };
  assert.equal(reviewBlock(base, AFTERNOON), null);
  assert.equal(reviewBlock({ ...base, reviewRequestedAt: AFTERNOON }, AFTERNOON), "already_sent");
  assert.equal(reviewBlock({ ...base, status: "scheduled" }, AFTERNOON), "not_completed");
  assert.equal(reviewBlock({ ...base, resolutionCode: "customer_declined" }, AFTERNOON), "no_work_done");
  assert.equal(reviewBlock({ ...base, resolutionCode: "no_access" }, AFTERNOON), "no_work_done");
  assert.equal(reviewBlock({ ...base, phone: null }, AFTERNOON), "no_phone");
  assert.equal(reviewBlock({ ...base, completedAt: hoursBefore(0.5) }, AFTERNOON), "too_soon");
  assert.equal(reviewBlock({ ...base, completedAt: hoursBefore(80) }, AFTERNOON), "too_old");
});

test("two racing sends text the customer once; it is recorded on the job", async () => {
  const business = await shop();
  try {
    const job = await visit(business);
    const sms = fakeSms();
    const results = await Promise.all([
      sendReviewRequest({ jobId: job.id, now: AFTERNOON, send: sms.send }),
      sendReviewRequest({ jobId: job.id, now: AFTERNOON, send: sms.send }),
    ]);
    assert.equal(results.filter((r) => r.sent).length, 1);
    assert.equal(sms.sent.length, 1);
    assert.match(sms.sent[0].body, /g\.page\/r\/luxe-hair\/review/);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.ok(after.reviewRequestedAt);
    assert.ok(await prisma.auditEvent.findFirst({ where: { jobId: job.id, action: "job.review_requested" } }));
  } finally {
    await drop(business.id);
  }
});

test("a regular is asked once a season, not after every visit", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const first = await visit(business, { phone, reviewRequestedAt: new Date(AFTERNOON.getTime() - REVIEW_PER_PHONE_GAP_MS / 2) });
    const second = await visit(business, { phone });
    const sms = fakeSms();
    assert.deepEqual(await sendReviewRequest({ jobId: second.id, now: AFTERNOON, send: sms.send }), { sent: false, reason: "asked_recently" });
    assert.equal(sms.sent.length, 0);
    assert.ok(first);
  } finally {
    await drop(business.id);
  }
});

test("no link, switched off, or Twilio down: nothing sent, and an unsent text is retried later", async () => {
  const none = await shop({ reviewUrl: null });
  const off = await shop({ reviewRequestsOn: false });
  const live = await shop();
  try {
    const sms = fakeSms();
    assert.deepEqual(await sendReviewRequest({ jobId: (await visit(none)).id, now: AFTERNOON, send: sms.send }), { sent: false, reason: "no_review_url" });
    assert.deepEqual(await sendReviewRequest({ jobId: (await visit(off)).id, now: AFTERNOON, send: sms.send }), { sent: false, reason: "off" });
    assert.equal(sms.sent.length, 0);

    const job = await visit(live);
    const down = async () => ({ sent: false, reason: "sms_not_configured" });
    assert.equal((await sendReviewRequest({ jobId: job.id, now: AFTERNOON, send: down })).sent, false);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).reviewRequestedAt, null, "released for the next run");
  } finally {
    await drop(none.id);
    await drop(off.id);
    await drop(live.id);
  }
});

test("a STOP holds: the real sender refuses and the visit is not asked again", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    await prisma.smsOptOut.create({ data: { businessId: business.id, phone, phoneNormalized: phone, source: "inbound-sms" } });
    const job = await visit(business, { phone });
    assert.deepEqual(await sendReviewRequest({ jobId: job.id, now: AFTERNOON }), { sent: false, reason: "customer_opted_out" });
    assert.ok((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).reviewRequestedAt, "claimed, so no retry");
  } finally {
    await drop(business.id);
  }
});

test("the sweep texts due visits in the shop's daytime only", async () => {
  const business = await shop();
  try {
    const due = await visit(business, { completedHoursAgo: 4 });
    const fresh = await visit(business, { completedHoursAgo: 0.2 });
    const night = fakeSms();
    await runReviewRequests({ now: new Date("2026-09-30T04:00:00Z"), send: night.send });
    assert.ok(!night.sent.some((s) => s.businessId === business.id), "11pm in Chicago: nothing");

    const day = fakeSms();
    await runReviewRequests({ now: AFTERNOON, send: day.send });
    const mine = day.sent.filter((s) => s.businessId === business.id);
    assert.equal(mine.length, 1);
    assert.ok((await prisma.job.findUniqueOrThrow({ where: { id: due.id } })).reviewRequestedAt);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: fresh.id } })).reviewRequestedAt, null);
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
