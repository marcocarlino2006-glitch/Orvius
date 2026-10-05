/*
 * Regression tests for the scale pass (docs/BACKLOG.md S3, S4): slot and
 * technician lookups read only the jobs that can matter, a live call never
 * waits on the owner's calendar server for a recently synced copy, and the
 * Command poll skips its rebuild when nothing changed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { BUSY_REFRESH_MS, BUSY_STALE_MAX_MS, getBusyWindows } from "../src/lib/busy-calendar.ts";
import { COMMAND_VERSION_BUCKET_MS, commandVersion, shopVersion } from "../src/lib/shop-version.ts";
import { jobsNear, loadTechCandidates } from "../src/lib/technician-match.ts";

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function makeShop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Scale Air",
      slug: `scale-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
      ...extra,
    },
  });
}

const icsAt = (start) => {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(new Date(start.getTime() + HOUR))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

async function withFetch(body, run) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(body, { status: 200, headers: { "content-type": "text/calendar" } });
  };
  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}

async function calendarShop(syncedAgoMs, storedStart) {
  const now = Date.now();
  return makeShop({
    busyCalendarUrl: "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
    busyCalendarJson: JSON.stringify([[storedStart.getTime(), storedStart.getTime() + HOUR]]),
    busyCalendarSyncedAt: syncedAgoMs == null ? null : new Date(now - syncedAgoMs),
  });
}

test("a fresh calendar copy is used without contacting the calendar", async () => {
  const stored = new Date(Date.now() + DAY);
  const shop = await calendarShop(60_000, stored);
  try {
    await withFetch(icsAt(new Date(Date.now() + 2 * DAY)), async (calls) => {
      const windows = await getBusyWindows(shop.id);
      assert.equal(calls(), 0);
      assert.deepEqual(windows.map((w) => w.start.getTime()), [stored.getTime()]);
    });
  } finally {
    await prisma.business.delete({ where: { id: shop.id } });
  }
});

test("a slightly stale copy answers from what is stored, then refreshes for the next look", async () => {
  const stored = new Date(Date.now() + DAY);
  const pulled = new Date(Date.now() + 2 * DAY);
  const shop = await calendarShop(BUSY_REFRESH_MS + 60_000, stored);
  try {
    await withFetch(icsAt(pulled), async (calls) => {
      const windows = await getBusyWindows(shop.id);
      assert.deepEqual(windows.map((w) => w.start.getTime()), [stored.getTime()], "answered from the stored copy");
      assert.equal(calls(), 1, "refresh ran (inline outside a request)");
    });
    const after = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
    const saved = JSON.parse(after.busyCalendarJson);
    assert.equal(saved[0][0], Math.floor(pulled.getTime() / 1000) * 1000, "next look sees the refreshed copy");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } });
  }
});

test("a copy too old to trust, or none at all, waits for the calendar", async () => {
  const pulled = new Date(Date.now() + 2 * DAY);
  const expected = Math.floor(pulled.getTime() / 1000) * 1000;
  for (const age of [BUSY_STALE_MAX_MS + 60_000, null]) {
    const shop = await calendarShop(age, new Date(Date.now() + DAY));
    try {
      await withFetch(icsAt(pulled), async (calls) => {
        const windows = await getBusyWindows(shop.id);
        assert.equal(calls(), 1);
        assert.deepEqual(windows.map((w) => w.start.getTime()), [expected], `age ${age}`);
      });
    } finally {
      await prisma.business.delete({ where: { id: shop.id } });
    }
  }
});

test("technician candidates carry only jobs near the time being assigned", async () => {
  const shop = await makeShop();
  try {
    const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Dana", isActive: true } });
    const at = new Date(Date.now() + 3 * DAY);
    const job = (offsetMs, title) =>
      prisma.job.create({
        data: { businessId: shop.id, technicianId: tech.id, title, status: "scheduled", scheduledAt: new Date(at.getTime() + offsetMs), durationMin: 60 },
      });
    const sameDay = await job(HOUR, "same day");
    const longInstall = await job(-3 * DAY, "long install started earlier");
    await job(-40 * DAY, "long ago");
    await job(40 * DAY, "far future");

    const [candidate] = await loadTechCandidates(shop.id, undefined, at);
    assert.deepEqual(new Set(candidate.jobs.map((j) => j.id)), new Set([sameDay.id, longInstall.id]));

    const window = jobsNear(at);
    assert.equal(at.getTime() - window.gte.getTime(), 7 * DAY);
    assert.equal(window.lte.getTime() - at.getTime(), 2 * DAY);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } });
  }
});

test("open-slot search reads only jobs that can overlap the booking horizon", () => {
  const src = read("src/lib/job.ts");
  const query = src.slice(src.indexOf("export async function findOpenSlots"), src.indexOf("prisma.technician.findMany"));
  assert.doesNotMatch(query, /scheduledAt: \{ not: null \}/);
  assert.match(query, /gte: new Date\(now\.getTime\(\) - 7/);
  assert.match(query, /MAX_SCHEDULE_DAYS \+ 1/);
});

test("Command's version holds while nothing changes and moves when a lead lands or time passes", async () => {
  const shop = await makeShop();
  try {
    const now = new Date();
    const first = commandVersion(await shopVersion(shop.id), now, null);
    assert.equal(commandVersion(await shopVersion(shop.id), now, null), first);
    await prisma.lead.create({ data: { businessId: shop.id, name: "New caller", phone: "+15125550100", source: "call" } });
    const second = commandVersion(await shopVersion(shop.id), now, null);
    assert.notEqual(second, first);
    const later = new Date(now.getTime() + COMMAND_VERSION_BUCKET_MS);
    assert.notEqual(commandVersion(await shopVersion(shop.id), later, null), second, "time-based parts still refresh");
    assert.notEqual(commandVersion(await shopVersion(shop.id), now, new Date(now.getTime() - DAY)), second, "a new brief window rebuilds");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } });
  }
});

test("the Command poll answers 'unchanged' before running any of the heavy loaders", () => {
  const route = read("src/app/api/ring1/route.ts");
  const early = route.indexOf("unchanged: true");
  assert.ok(early > 0);
  for (const heavy of ["getDispatchBoard(", "getShopHealth(", "getAttentionQueue(", "loadPersonalBrief("]) {
    assert.ok(route.indexOf(heavy) > early, `${heavy} runs after the version check`);
  }
  const client = read("src/lib/ring1-context.tsx");
  assert.match(client, /void load\(true\)/, "background ticks ask only for changes");
  assert.match(client, /const refresh = useCallback\(\(\) => load\(false\)/, "an asked-for refresh is always full");
});

test("an account with no shop yet stops polling Command instead of failing every 30 seconds", () => {
  const client = read("src/lib/ring1-context.tsx");
  assert.match(client, /res\.status === 404[\s\S]{0,120}return "no-shop"/, "a 404 is the no-shop state, not an error");
  assert.match(client, /result === "no-shop"\) stop\(\)/, "a tick that finds no shop stops the loop");
  assert.match(client, /result === "no-shop" \|\| !refreshMs\) return;[\s\S]{0,120}openStream\(\)/, "the stream opens only once a shop answered");
  const route = read("src/app/api/ring1/route.ts");
  assert.match(route, /status === 404\) return NextResponse\.json\(\{ noShop: true \}\)/, "no shop answers 200, so the browser logs no failed request");
  assert.match(client, /"noShop" in json[\s\S]{0,80}return "no-shop"/);
});

test("the top bar Ask button keeps an icon when its label is hidden", () => {
  const shell = read("src/components/os-shell.tsx");
  assert.match(shell, /os-topbar-ask[\s\S]{0,200}aria-label="Ask"[\s\S]{0,200}<OsIcon name="ask" \/>/);
});

test.after(() => prisma.$disconnect());
