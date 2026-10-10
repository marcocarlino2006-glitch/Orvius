#!/usr/bin/env node
/*
 * Holidays and the shop clock: a day the owner marks closed is never offered
 * to a caller, the receptionist knows about it, and the settings API refuses
 * a bad date or a made-up time zone instead of storing it.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;

const nextServer = await import("next/server");
mock.module("next/server", {
  namedExports: { ...nextServer, after: () => {} },
});

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const {
  closureWindows,
  formatClosuresForPrompt,
  isClosedDay,
  parseClosures,
  shopDay,
  suggestedHolidays,
  upcomingClosures,
  usHolidays,
  validateClosures,
} = await import("../src/lib/shop-closures.ts");
const { findAvailableSchedules } = await import("../src/lib/availability.ts");
const { buildAssistantSystemPrompt, isAfterHours } = await import("../src/lib/business.ts");
const { findOpenSlots } = await import("../src/lib/job.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const NY = "America/New_York";
const WEEKDAYS = JSON.stringify(
  Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [
      d,
      { open: "08:00", close: "17:00" },
    ]),
  ),
);
const made = [];
const uid = () => Math.random().toString(36).slice(2, 10);

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("closures parse sorted and de-duplicated, and junk is dropped rather than thrown", () => {
  assert.deepEqual(parseClosures(null), []);
  assert.deepEqual(parseClosures("not json"), []);
  assert.deepEqual(parseClosures('{"date":"2026-12-25"}'), []);
  assert.deepEqual(
    parseClosures(
      JSON.stringify([
        { date: "2026-12-25", label: "Christmas" },
        { date: "2026-02-30", label: "Not a day" },
        { date: "2026-11-26", label: "  " },
        { date: "2026-12-25", label: "Christmas Day" },
        "nope",
      ]),
    ),
    [
      { date: "2026-11-26", label: "Closed" },
      { date: "2026-12-25", label: "Christmas Day" },
    ],
  );
});

test("the API check is strict: bad dates and too many days are refused in plain words", () => {
  assert.equal(validateClosures("{").ok, false);
  const bad = validateClosures(JSON.stringify([{ date: "12/25/2026", label: "X" }]));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /isn't a date/);
  const many = Array.from({ length: 61 }, (_, i) => ({
    date: new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10),
    label: "Off",
  }));
  assert.match(validateClosures(JSON.stringify(many)).error, /Up to 60/);
  const ok = validateClosures(JSON.stringify([{ date: "2026-07-04", label: "Fourth" }]));
  assert.deepEqual(ok, { ok: true, json: '[{"date":"2026-07-04","label":"Fourth"}]' });
});

test("US holidays land on their real dates", () => {
  const byLabel = Object.fromEntries(usHolidays(2026).map((h) => [h.label, h.date]));
  assert.equal(byLabel["Memorial Day"], "2026-05-25");
  assert.equal(byLabel["Labor Day"], "2026-09-07");
  assert.equal(byLabel.Thanksgiving, "2026-11-26");
  assert.equal(byLabel["Christmas Day"], "2026-12-25");
  assert.equal(Object.fromEntries(usHolidays(2027).map((h) => [h.label, h.date])).Thanksgiving, "2027-11-25");
});

test("suggestions skip what the shop already marked and what has passed", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  const picks = suggestedHolidays([{ date: "2026-11-26", label: "Thanksgiving" }], NY, now);
  assert.deepEqual(
    picks.map((h) => h.date),
    ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"],
  );
});

test("the shop's calendar day follows its zone, not the server's", () => {
  // 11:30pm Christmas Eve in Los Angeles is already Christmas in UTC.
  const at = new Date("2026-12-25T07:30:00Z");
  assert.equal(shopDay(at, "America/Los_Angeles"), "2026-12-24");
  const closures = [{ date: "2026-12-25", label: "Christmas Day" }];
  assert.equal(isClosedDay(at, closures, "America/Los_Angeles"), false);
  assert.equal(isClosedDay(at, closures, NY), true);
});

test("a closed day blocks every opening that day, and booking moves to the next open day", () => {
  const now = new Date("2026-11-25T13:00:00Z"); // Wed 8am New York
  const closures = [{ date: "2026-11-26", label: "Thanksgiving" }, { date: "2026-11-25", label: "Training" }];
  const slots = findAvailableSchedules(
    {
      now,
      hoursJson: WEEKDAYS,
      timezone: NY,
      existing: [],
      capacity: 1,
      blocked: closureWindows(closures, NY, now),
    },
    { count: 3 },
  );
  assert.ok(slots.length > 0);
  for (const slot of slots) assert.equal(shopDay(slot, NY) >= "2026-11-27", true, slot.toISOString());
  assert.deepEqual(upcomingClosures(closures, NY, new Date("2026-11-26T12:00:00Z")).map((c) => c.date), ["2026-11-26"]);
});

test("isAfterHours treats a closed day as after hours, even at 10am", () => {
  const tenAm = new Date("2026-11-26T15:00:00Z");
  assert.equal(isAfterHours(tenAm, WEEKDAYS, NY), false);
  assert.equal(isAfterHours(tenAm, WEEKDAYS, NY, JSON.stringify([{ date: "2026-11-26", label: "Thanksgiving" }])), true);
});

test("the receptionist's instructions list the closures and say never to offer a time", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const raw = JSON.stringify([
    { date: "2026-10-01", label: "Gone" },
    { date: "2026-11-26", label: "Thanksgiving" },
  ]);
  const block = formatClosuresForPrompt(raw, NY, now);
  assert.match(block, /DAYS CLOSED/);
  assert.match(block, /Thursday, November 26, 2026: Thanksgiving/);
  assert.doesNotMatch(block, /Gone/);
  assert.match(block, /Never offer a time on a closed day/);
  assert.equal(formatClosuresForPrompt("[]", NY, now), "");

  const prompt = buildAssistantSystemPrompt({
    name: "Holiday Heating",
    trade: "HVAC",
    hoursJson: WEEKDAYS,
    servicesJson: "[]",
    closedDatesJson: JSON.stringify([{ date: "2099-11-26", label: "Far holiday" }]),
    timezone: NY,
  });
  assert.match(prompt, /Far holiday/);
});

test("live booking skips the shop's closed days", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Closed Days Heating",
      slug: `closed-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: WEEKDAYS,
      timezone: NY,
      servicesJson: "[]",
    },
  });
  made.push(shop.id);
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech", phone: "+15550003333", skillsJson: "[]" } });
  const params = { businessId: shop.id, urgency: null, durationMin: 60, skill: "general", hoursJson: WEEKDAYS, timezone: NY };
  const [first] = await findOpenSlots(params, { count: 1 });
  assert.ok(first);
  const closedDay = shopDay(first, NY);
  await prisma.business.update({
    where: { id: shop.id },
    data: { closedDatesJson: JSON.stringify([{ date: closedDay, label: "Closed" }]) },
  });
  const after = await findOpenSlots(params, { count: 3 });
  assert.ok(after.length > 0);
  for (const slot of after) assert.notEqual(shopDay(slot, NY), closedDay);
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("settings save days closed and the time zone, and refuse bad ones", async () => {
  const { GET, PATCH } = await import("../src/app/api/account/route.ts");
  const shop = await prisma.business.create({
    data: {
      name: `Zone ${uid()}`,
      slug: `zone-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  made.push(shop.id);
  signedInAs = shop.ownerEmail;
  try {
    const saved = await PATCH(
      patch({
        timezone: "America/Denver",
        closedDatesJson: JSON.stringify([{ date: "2099-12-25", label: "Christmas Day" }, { date: "2099-07-04" }]),
      }),
    );
    assert.equal(saved.status, 200, await saved.clone().text());
    const row = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(row.timezone, "America/Denver");
    assert.deepEqual(JSON.parse(row.closedDatesJson), [
      { date: "2099-07-04", label: "Closed" },
      { date: "2099-12-25", label: "Christmas Day" },
    ]);

    const read = await (await GET(new Request("http://localhost/api/account"))).json();
    const body = read.business ?? read;
    assert.equal(body.timezone, "America/Denver");
    assert.match(body.closedDatesJson, /2099-12-25/);

    const badZone = await PATCH(patch({ timezone: "Mars/Olympus" }));
    assert.equal(badZone.status, 400);
    assert.match((await badZone.json()).error, /time zone/);

    const badDay = await PATCH(patch({ closedDatesJson: JSON.stringify([{ date: "tomorrow" }]) }));
    assert.equal(badDay.status, 400);
    assert.match((await badDay.json()).error, /isn't a date/);

    const unchanged = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(unchanged.timezone, "America/Denver");
  } finally {
    signedInAs = null;
  }
});
