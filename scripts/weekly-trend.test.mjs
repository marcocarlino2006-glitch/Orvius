import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { getShopOutcomes } from "../src/lib/shop-outcomes.ts";

const prisma = new PrismaClient();

/** The Monday the trend would bucket `at` into. */
function mondayOf(at) {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function inWeek(weeksAgo, dayInWeek = 1, hour = 10) {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() - weeksAgo * 7 + dayInWeek);
  monday.setHours(hour, 0, 0, 0);
  return monday;
}

async function shopWithLeads(label, rows) {
  const business = await prisma.business.create({
    data: {
      name: label,
      slug: `${label.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`,
      billingStatus: "pilot",
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

test.after(() => prisma.$disconnect());
