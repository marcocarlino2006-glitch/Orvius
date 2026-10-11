/*
 * A calendar Orvius can't read is never a source of open times. Past the
 * serve-stale window with the pull failing, a caller is offered nothing, is not
 * told the shop is booked up, and the owner is told once why.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "VAPI_API_KEY"]) delete process.env[key];

const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { CALENDAR_UNREADABLE_REPLY } = await import("../src/lib/in-call-tool-defs.ts");
const { BUSY_STALE_MAX_MS, busyCalendarUnreadable } = await import("../src/lib/busy-calendar.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOURS = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "07:00", close: "19:00" }])),
);

async function shopWithCalendar(syncedAgoMs) {
  const shop = await prisma.business.create({
    data: {
      name: "Calendar Air",
      slug: `cal-${stamp()}`,
      trade: "HVAC",
      timezone: "America/Chicago",
      hoursJson: HOURS,
      ownerPhone: "+15125550190",
      ownerEmail: `cal-${stamp()}@example.test`,
      networkOn: true,
      networkZip3: "606",
      busyCalendarUrl: "https://calendar.google.com/calendar/ical/a/private-b/basic.ics",
      busyCalendarJson: "[]",
      busyCalendarSyncedAt: new Date(Date.now() - syncedAgoMs),
    },
  });
  await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", phone: "+15125550191" } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `cal-${stamp()}`, status: "in-progress" } });
  return { shop, call };
}

const ask = ({ shop, call }) =>
  handleInCallToolCalls({
    shop,
    callId: call.id,
    call,
    toolCalls: [{ id: "t1", name: "check_availability", args: { serviceType: "AC tune-up" } }],
  }).then((r) => r[0].result);

test("an unread calendar is unreadable only past the serve-stale window", () => {
  const now = new Date();
  const url = "https://calendar.google.com/x.ics";
  assert.equal(busyCalendarUnreadable({ busyCalendarUrl: null, busyCalendarSyncedAt: null }, now), false);
  assert.equal(busyCalendarUnreadable({ busyCalendarUrl: url, busyCalendarSyncedAt: new Date(now - 60_000) }, now), false);
  assert.equal(busyCalendarUnreadable({ busyCalendarUrl: url, busyCalendarSyncedAt: new Date(now - BUSY_STALE_MAX_MS) }, now), true);
  assert.equal(busyCalendarUnreadable({ busyCalendarUrl: url, busyCalendarSyncedAt: null }, now), true);
});

test("a calendar that can't be pulled past the stale window offers no time, never says booked up, and tells the owner once", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Calendar returned 500");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const setup = await shopWithCalendar(BUSY_STALE_MAX_MS + 60_000);
  try {
    assert.equal(await ask(setup), CALENDAR_UNREADABLE_REPLY);
    assert.equal(await ask(setup), CALENDAR_UNREADABLE_REPLY);
    const alerts = await prisma.ownerNotification.findMany({
      where: { businessId: setup.shop.id, dedupeKey: { startsWith: "busy-calendar-unreadable:" } },
    });
    assert.deepEqual(alerts.map((a) => a.channel).sort(), ["email", "sms"], "one text and one email, not one per call");
    assert.match(alerts[0].message, /can't read your calendar.*Calendar returned 500/);
  } finally {
    await prisma.business.delete({ where: { id: setup.shop.id } });
  }
});

test("a fresh calendar copy still offers times without waiting on the provider", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("must not be fetched on a fresh copy");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const setup = await shopWithCalendar(60_000);
  try {
    assert.match(await ask(setup), /Open times/);
  } finally {
    await prisma.business.delete({ where: { id: setup.shop.id } });
  }
});

test("a shop whose Jobber, Housecall Pro or ServiceTitan schedule isn't being read is told so, and how to fix it", async () => {
  const { readFileSync } = await import("node:fs");
  const section = readFileSync(new URL("../src/components/settings-center/sections/integrations-section.tsx", import.meta.url), "utf8");
  assert.match(
    section,
    /account\.business\?\.bookingMode === "alert" \|\| account\.busyCalendar \|\| readingSchedule\s*\? null/,
    "no warning once busy times, owner-set times, or a working schedule read cover it",
  );
  assert.match(section, /Orvius can&apos;t read your \{blindTo\} schedule yet/);
  assert.match(section, /under Busy times below/);
  assert.match(section, /Alert me first/);
});
