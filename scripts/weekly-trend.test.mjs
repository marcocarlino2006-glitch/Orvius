import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { getShopOutcomes, trendWeeks, weekIndex } from "../src/lib/shop-outcomes.ts";

const prisma = new PrismaClient();

/** The Monday a UTC shop's trend would bucket `at` into. */
function mondayOf(at) {
  const start = new Date(at);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

function inWeek(weeksAgo, dayInWeek = 1, hour = 10) {
  const monday = mondayOf(new Date());
  monday.setUTCDate(monday.getUTCDate() - weeksAgo * 7 + dayInWeek);
  monday.setUTCHours(hour, 0, 0, 0);
  return monday;
}

async function shopWithLeads(label, rows) {
  const business = await prisma.business.create({
    data: {
      name: label,
      slug: `${label.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`,
      billingStatus: "pilot",
      timezone: "UTC",
    },
  });

  for (const row of rows) {
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "Caller",
        serviceType: "No heat",
        createdAt: row.at,
      },
    });
    if (!row.booked) continue;
    await prisma.job.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        title: "No heat",
        status: "completed",
        createdAt: row.at,
      },
    });
  }

  return business;
}

test("the trend returns eight week buckets, oldest first", async () => {
  const business = await shopWithLeads("Trend Shape", [
    { at: inWeek(5), booked: true },
    { at: inWeek(5), booked: false },
    { at: inWeek(1), booked: true },
  ]);

  try {
    const { weeks } = await getShopOutcomes(business.id);

    assert.equal(weeks.length, 8, "eight weeks of history, always");
    for (let i = 1; i < weeks.length; i++) {
      assert.ok(
        weeks[i - 1].start < weeks[i].start,
        "buckets run oldest to newest",
      );
    }

    /*
      The empty weeks have to come back as zeros rather than be absent. A chart
      that drops them closes the gap and turns a fortnight of silence into a
      continuous line, which is the opposite of what happened.
    */
    assert.equal(
      weeks.filter((week) => week.leads === 0).length,
      6,
      "weeks with no work are present and zero, not missing",
    );

    const five = weeks.at(-6);
    assert.deepEqual(
      { leads: five.leads, booked: five.booked },
      { leads: 2, booked: 1 },
      "five weeks ago holds both its leads and the one that booked",
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("only the week in progress is marked partial", async () => {
  const business = await shopWithLeads("Trend Partial", [
    { at: inWeek(0, 0), booked: false },
  ]);

  try {
    const { weeks } = await getShopOutcomes(business.id);
    const partial = weeks.filter((week) => week.partial);

    assert.equal(partial.length, 1, "exactly one week is still running");
    assert.equal(
      partial[0].start,
      weeks.at(-1).start,
      "and it is the newest bucket",
    );
    assert.equal(
      partial[0].start,
      mondayOf(new Date()).toISOString().slice(0, 10),
      "which is this Monday",
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a lead is bucketed by the week it arrived, not the window", async () => {
  /*
    The trend is deliberately independent of windowDays: asking for a one-day
    window must not collapse eight weeks of history into one bar.
  */
  const business = await shopWithLeads("Trend Window", [
    { at: inWeek(6), booked: true },
    { at: inWeek(3), booked: false },
  ]);

  try {
    const narrow = await getShopOutcomes(business.id, 1);
    const wide = await getShopOutcomes(business.id, 30);

    assert.equal(narrow.leads, 0, "the one-day window sees none of it");
    assert.deepEqual(
      narrow.weeks.map((w) => w.leads),
      wide.weeks.map((w) => w.leads),
      "yet both report the same eight weeks of history",
    );
    assert.equal(
      narrow.weeks.reduce((sum, w) => sum + w.leads, 0),
      2,
      "and both find both leads",
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a lead older than the trend is not folded into the first bar", async () => {
  const business = await shopWithLeads("Trend Cutoff", [
    { at: inWeek(20), booked: true },
    { at: inWeek(2), booked: true },
  ]);

  try {
    const { weeks } = await getShopOutcomes(business.id);

    assert.equal(
      weeks.reduce((sum, w) => sum + w.leads, 0),
      1,
      "the twenty-week-old lead is out of range and stays out",
    );
    assert.equal(weeks[0].leads, 0, "it is not swept into the oldest bucket");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("weeks start at midnight where the shop is, across a clock change", () => {
  // Tuesday Nov 10 2026; US clocks fell back on Sunday Nov 1.
  const now = new Date("2026-11-10T15:00:00Z");
  const { weeks, end } = trendWeeks("America/New_York", now, 3);

  assert.deepEqual(weeks.map((w) => w.day), ["2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.deepEqual(
    weeks.map((w) => w.start.toISOString()),
    ["2026-10-26T04:00:00.000Z", "2026-11-02T05:00:00.000Z", "2026-11-09T05:00:00.000Z"],
    "Monday midnight in New York, an hour later in UTC once clocks fall back",
  );
  assert.equal(end.toISOString(), "2026-11-16T05:00:00.000Z");

  // Sunday 11:30 PM in New York is already Monday in UTC.
  assert.equal(weekIndex(weeks, end, new Date("2026-11-09T04:30:00Z")), 1, "Sunday night stays in its own week");
  assert.equal(weekIndex(weeks, end, new Date("2026-11-09T05:00:00Z")), 2, "Monday midnight opens the next");
  assert.equal(weekIndex(weeks, end, new Date("2026-10-26T03:59:59Z")), -1, "before the first week is out");
  assert.equal(weekIndex(weeks, end, end), -1, "next Monday is out");
});

test("a Sunday-night lead lands in the shop's week, not the server's", async () => {
  const business = await shopWithLeads("Trend Shop Time", []);
  try {
    await prisma.business.update({ where: { id: business.id }, data: { timezone: "Pacific/Honolulu" } });
    const { weeks: frame } = trendWeeks("Pacific/Honolulu");
    // 10 PM Sunday in Honolulu (UTC-10) is 8 AM Monday in UTC.
    const sundayNight = new Date(frame.at(-1).start.getTime() - 2 * 3_600_000);
    await prisma.lead.create({
      data: { businessId: business.id, name: "Caller", serviceType: "No heat", createdAt: sundayNight },
    });

    const { weeks } = await getShopOutcomes(business.id);
    assert.equal(weeks.at(-1).start, frame.at(-1).day, "buckets are labelled with the shop's Monday");
    assert.equal(weeks.at(-1).leads, 0, "this week is still empty");
    assert.equal(weeks.at(-2).leads, 1, "the Sunday call counts toward last week");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
