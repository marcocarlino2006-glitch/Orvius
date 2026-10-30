#!/usr/bin/env node
/*
 * Orvius's proof numbers across every real shop, this week against last: a
 * receptionist that gets worse reaches the founders the day it shows, and a
 * quiet week is not mistaken for a trend.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.RESEND_API_KEY = "re_test_key";
delete process.env.RESEND_FROM;
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";

const { scoreWeek, scorecardDrops, checkScorecardOnceADay, getReceptionistScorecard } = await import("../src/lib/receptionist-scorecard.ts");

const prisma = new PrismaClient();
const call = (over = {}) => ({ answered: true, booked: false, bookable: false, clean: true, transferred: false, replyP90Ms: 900, ...over });
const many = (n, over) => Array.from({ length: n }, () => call(over));

test("a week is counted the way an owner would: booked only out of calls that could have been", () => {
  const week = scoreWeek([...many(6, { bookable: true, booked: true }), ...many(2, { bookable: true }), ...many(1, { answered: false, clean: false }), call({ transferred: true, replyP90Ms: 2000 })]);
  assert.equal(week.calls, 10);
  assert.equal(week.answered, 9);
  assert.equal(week.bookable, 8);
  assert.equal(week.booked, 6);
  assert.equal(week.graded, 9);
  assert.equal(week.clean, 9);
  assert.equal(week.transferred, 1);
  assert.equal(week.replyP90Ms, 900);
});

test("a real drop is named in plain words; a small or quiet week is not a trend", () => {
  const last = scoreWeek([...many(18, { bookable: true, booked: true }), ...many(2, { bookable: true })]);
  const worse = scoreWeek([...many(10, { bookable: true, booked: true }), ...many(6, { bookable: true, clean: false }), ...many(4, { answered: false, clean: false, replyP90Ms: 2400 })]);
  const drops = scorecardDrops(worse, last);
  assert.ok(drops.some((d) => /^Answered fell from 100% to 80% of calls\.$/.test(d)), drops.join(" | "));
  assert.ok(drops.some((d) => /^Booked fell from 90% to 63% of bookable calls\.$/.test(d)), drops.join(" | "));
  assert.ok(drops.some((d) => /wouldn't need to hear fell/.test(d)));
  assert.deepEqual(scorecardDrops(scoreWeek(many(9, { answered: false })), last), [], "nine calls is too few to call");
  assert.deepEqual(scorecardDrops(last, last), []);
});

test("slower replies count only when they are both much slower and noticeably so", () => {
  const last = scoreWeek(many(12, { replyP90Ms: 1000 }));
  assert.deepEqual(scorecardDrops(scoreWeek(many(12, { replyP90Ms: 1200 })), last), []);
  assert.deepEqual(scorecardDrops(scoreWeek(many(12, { replyP90Ms: 1500 })), last), ["Slowest replies grew from 1.0s to 1.5s."]);
});

test("the daily check runs once a day from the 30-minute sweep and the scorecard reads real shops only", async () => {
  const realFetch = globalThis.fetch;
  const emails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "e" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const day = new Date("2031-05-06T12:00:00Z");
  try {
    const first = await checkScorecardOnceADay(day);
    assert.equal(first.ran, true);
    assert.deepEqual(await checkScorecardOnceADay(day), { ran: false });
    const card = await getReceptionistScorecard(day);
    assert.equal(typeof card.thisWeek.calls, "number");
    assert.equal(emails.length, first.drops.length ? 1 : 0);
    assert.match(readFileSync("src/lib/line-watch-sweep.ts", "utf8"), /checkScorecardOnceADay\(\)/);
    assert.match(readFileSync("src/app/admin/page.tsx", "utf8"), /<ReceptionistScorecardCard \/>/);
    assert.match(readFileSync("src/lib/receptionist-scorecard.ts", "utf8"), /environment: "production"[\s\S]*channel: null/, "real phone calls only, not demos or test shops");
  } finally {
    globalThis.fetch = realFetch;
    await prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: "scorecard-check", externalId: "2031-05-06" } });
    await prisma.$disconnect();
  }
});
