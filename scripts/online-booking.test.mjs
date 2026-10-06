#!/usr/bin/env node
/*
 * Online booking: a customer books one of the same open times the
 * receptionist offers, it lands as a booked job with the owner told, a time
 * can't be taken twice, and the page only exists when the owner turns it on.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { bookableShop, bookingServices, bookingSlots, bookOnline } = await import("../src/lib/online-booking.ts");
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
      name: "Bright Smile Dental",
      slug: `bk-${stamp()}`,
      trade: "Dental",
      hoursJson: ALL_DAY,
      servicesJson: JSON.stringify([{ name: "Cleaning", durationMin: 60 }, { name: "Whitening", durationMin: 90 }]),
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

const call = (handler, slug, init) =>
  handler(new Request(`http://localhost/api/public/book/${slug}`, init), { params: Promise.resolve({ slug }) });

test("the page exists only when the owner turns it on and the workspace is paid", async () => {
  const on = await shop();
  const off = await shop({ bookingPageOn: false });
  const testShop = await shop({ environment: "test" });
  const lapsed = await shop({ billingStatus: "canceled" });
  try {
    assert.ok(await bookableShop(on.slug));
    assert.equal(await bookableShop(off.slug), null);
    assert.equal(await bookableShop(testShop.slug), null);
    assert.equal(await bookableShop(lapsed.slug), null);
    assert.equal(await bookableShop("../etc/passwd"), null);
    assert.equal((await call(route.GET, off.slug)).status, 404);
  } finally {
    for (const s of [on, off, testShop, lapsed]) await drop(s.id);
  }
});

test("services: the shop's own list first, the trade's defaults otherwise", () => {
  assert.deepEqual(bookingServices({ servicesJson: '[{"name":"Cleaning"},"Whitening"]', trade: "Dental", name: "x" }), ["Cleaning", "Whitening"]);
  const hvac = bookingServices({ servicesJson: "[]", trade: "HVAC", name: "Cole Heating" });
  assert.ok(hvac.includes("Maintenance tune-up"));
  assert.ok(hvac.length >= 2);
});

test("a booking lands as a job on the schedule, the customer on file, and the owner told", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const slots = await bookingSlots(live, "Cleaning");
    assert.ok(slots.length > 3, "open times are offered");
    assert.ok(new Date(slots[0].at) > new Date());
    const days = new Set(slots.map((s) => new Date(s.at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" })));
    assert.ok(days.size >= 5, "the page spans the week, not one morning");
    for (const day of days) {
      assert.ok(slots.filter((s) => new Date(s.at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) === day).length <= 8);
    }

    const phone = randomPhone();
    const result = await bookOnline(live, {
      serviceType: "Cleaning",
      at: slots[0].at,
      name: "Ann Cole",
      phone,
      email: "ann@example.test",
      notes: "Sensitive on the left side",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const job = await prisma.job.findUniqueOrThrow({ where: { id: result.jobId }, include: { lead: true, customer: true } });
    assert.equal(job.status, "scheduled");
    assert.equal(job.scheduledAt.toISOString(), slots[0].at);
    assert.equal(job.durationMin, 60, "the shop's own duration for the service");
    assert.equal(job.lead.source, "web");
    assert.equal(job.lead.status, "booked");
    assert.equal(job.customer.phoneNormalized, phone);
    const alert = await prisma.ownerNotification.findFirst({ where: { businessId: business.id } });
    assert.match(alert?.message ?? "", /^Booked online: Ann Cole · Cleaning/);
    assert.ok(await prisma.auditEvent.findFirst({ where: { jobId: job.id, action: "job.booked_online" } }));

    const later = await bookingSlots(live, "Cleaning");
    assert.ok(!later.some((s) => s.at === slots[0].at), "the booked time is no longer offered");
  } finally {
    await drop(business.id);
  }
});

test("one person can't be booked twice for the same time", async () => {
  const business = await shop();
  try {
    const live = await bookableShop(business.slug);
    const [first] = await bookingSlots(live, "Cleaning");
    const book = (name) => bookOnline(live, { serviceType: "Cleaning", at: first.at, name, phone: randomPhone() });
    const results = await Promise.all([book("Ann Cole"), book("Bob Diaz")]);
    assert.ok(results.filter((r) => r.ok).length <= 1, "never two on one time");
    assert.ok(results.some((r) => !r.ok && r.reason === "slot_taken"));
    const live2 = await prisma.job.count({ where: { businessId: business.id, scheduledAt: new Date(first.at), status: "scheduled" } });
    assert.ok(live2 <= 1);
  } finally {
    await drop(business.id);
  }
});

test("bad input and danger are refused with a way forward", async () => {
  const business = await shop({ trade: "Plumbing", servicesJson: "[]", vapiPhoneNumber: randomPhone() });
  try {
    const live = await bookableShop(business.slug);
    const service = bookingServices(live)[0];
    const [slot] = await bookingSlots(live, service);
    assert.equal((await bookOnline(live, { serviceType: service, at: slot.at, name: "Ann", phone: "123" })).reason, "bad_phone");
    assert.equal((await bookOnline(live, { serviceType: "Brain surgery", at: slot.at, name: "Ann", phone: randomPhone() })).reason, "bad_service");
    assert.equal((await bookOnline(live, { serviceType: service, at: "2020-01-01T10:00:00Z", name: "Ann", phone: randomPhone() })).reason, "bad_time");
    const gas = await bookOnline(live, { serviceType: service, at: slot.at, name: "Ann", phone: randomPhone(), notes: "it smells like gas in the kitchen" });
    assert.equal(gas.reason, "safety");
    assert.match(gas.message, /911/);
    assert.equal(await prisma.job.count({ where: { businessId: business.id } }), 0);
  } finally {
    await drop(business.id);
  }
});

test("the API books, and a bot filling the hidden field gets nothing", async () => {
  const business = await shop();
  try {
    const info = await (await call(route.GET, business.slug, undefined)).json();
    assert.deepEqual(info.services, ["Cleaning", "Whitening"]);
    const withSlots = await (
      await route.GET(new Request(`http://localhost/api/public/book/${business.slug}?service=Whitening`), {
        params: Promise.resolve({ slug: business.slug }),
      })
    ).json();
    assert.ok(withSlots.slots.length > 0);

    const post = (body) =>
      call(route.POST, business.slug, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
        body: JSON.stringify(body),
      });
    const bot = await post({ serviceType: "Whitening", at: withSlots.slots[0].at, name: "Spam Bot", phone: randomPhone(), website: "http://spam" });
    assert.equal(bot.status, 400);
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 0);

    const ok = await post({ serviceType: "Whitening", at: withSlots.slots[0].at, name: "Ann Cole", phone: randomPhone() });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).ok, true);
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
