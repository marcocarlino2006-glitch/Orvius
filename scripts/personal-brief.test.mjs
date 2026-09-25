#!/usr/bin/env node
/*
 * The top of Command is written for one owner: their time of day, what changed
 * since they last looked, and patterns in their own shop's history. A pattern
 * is never stated until there is enough history to make it true.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { composePersonalBrief, dayMoment, learnShopPatterns } from "../src/lib/personal-brief.ts";
import { firstNameFrom, parseSince } from "../src/lib/personal-brief.ts";

const NY = "America/New_York";
const today = { jobs: 0, unassigned: 0, firstJobAt: null, firstJobTech: null, completed: 0, bookedToday: 0 };
const base = {
  timezone: NY,
  firstName: "Dana",
  since: null,
  today,
  totalCalls: 40,
  lineVerified: true,
  afterHoursNow: false,
  patterns: [],
};

test("the moment is read in the shop's own time zone", () => {
  const at = new Date("2026-09-25T10:30:00Z");
  assert.equal(dayMoment(at, NY), "morning");
  assert.equal(dayMoment(at, "America/Los_Angeles"), "night");
  assert.equal(dayMoment(new Date("2026-09-25T19:00:00Z"), NY), "day");
  assert.equal(dayMoment(new Date("2026-09-25T23:00:00Z"), NY), "evening");
});

test("the greeting uses the owner's first name when there is one", () => {
  const brief = composePersonalBrief({ ...base, now: new Date("2026-09-25T13:00:00Z") });
  assert.equal(brief.greeting, "Morning, Dana.");
  const anon = composePersonalBrief({ ...base, firstName: null, now: new Date("2026-09-25T13:00:00Z") });
  assert.equal(anon.greeting, "Morning.");
  assert.equal(firstNameFrom("Dana Ruiz"), "Dana");
  assert.equal(firstNameFrom("owner@shop.com"), null);
  assert.equal(firstNameFrom(""), null);
});

test("setup comes before anything else for a shop that isn't proven yet", () => {
  const now = new Date("2026-09-25T13:00:00Z");
  const unproven = composePersonalBrief({ ...base, lineVerified: false, now });
  assert.match(unproven.headline, /call your Orvius line once/);
  const noCalls = composePersonalBrief({ ...base, totalCalls: 0, now, since: { at: new Date(now - 3_600_000), calls: 0, booked: 0, needsYou: 0 } });
  assert.match(noCalls.headline, /first real call/);
});

test("what changed since the owner last looked leads the brief", () => {
  const now = new Date("2026-09-25T13:00:00Z");
  const since = { at: new Date(now.getTime() - 3 * 3_600_000), calls: 4, booked: 2, needsYou: 1 };
  const brief = composePersonalBrief({ ...base, now, since });
  assert.equal(brief.headline, "Since you looked 3 hours ago: 4 calls, 2 booked, 1 needs you.");
  const quiet = composePersonalBrief({ ...base, now, since: { ...since, calls: 0, booked: 0, needsYou: 0 } });
  assert.match(quiet.headline, /^Quiet since you looked 3 hours ago/);
});

test("without a last visit, the brief follows the day", () => {
  const morning = composePersonalBrief({
    ...base,
    now: new Date("2026-09-25T12:00:00Z"),
    today: { ...today, jobs: 3, unassigned: 1, firstJobAt: new Date("2026-09-25T12:30:00Z"), firstJobTech: "Luis" },
  });
  assert.equal(morning.headline, "3 jobs on the board today.");
  assert.deepEqual(morning.detail, ["First job 8:30 AM with Luis.", "1 job still without a technician."]);

  const evening = composePersonalBrief({
    ...base,
    now: new Date("2026-09-25T23:00:00Z"),
    afterHoursNow: true,
    today: { ...today, bookedToday: 5, completed: 4 },
  });
  assert.equal(evening.headline, "Today: 5 jobs booked, 4 completed.");
  assert.ok(evening.detail.includes("You're closed — the line is covering calls."));
});

test("a stale or bogus last visit is ignored", () => {
  const now = new Date("2026-09-25T13:00:00Z");
  assert.equal(parseSince(null, now), null);
  assert.equal(parseSince("not a date", now), null);
  assert.equal(parseSince(new Date(now.getTime() - 10_000).toISOString(), now), null);
  assert.equal(parseSince(new Date(now.getTime() - 30 * 86_400_000).toISOString(), now), null);
  assert.equal(parseSince(new Date(now.getTime() + 3_600_000).toISOString(), now), null);
  assert.ok(parseSince(new Date(now.getTime() - 3_600_000).toISOString(), now));
});

test("patterns stay silent until the shop has enough history", () => {
  const few = learnShopPatterns({
    calls: Array.from({ length: 10 }, () => ({ createdAt: new Date("2026-09-21T13:00:00Z") })),
    leads: Array.from({ length: 5 }, () => ({ categoryCode: "hvac.no_cool", returning: true })),
    hoursJson: "{}",
    timezone: NY,
  });
  assert.deepEqual(few, []);
});

test("a shop with real history hears its own patterns", () => {
  const mondayMorning = Array.from({ length: 12 }, (_, i) => ({ createdAt: new Date(`2026-09-${String(1 + 7 * (i % 3)).padStart(2, "0")}T13:${String(i).padStart(2, "0")}:00Z`) }));
  const lateNights = Array.from({ length: 10 }, (_, i) => ({ createdAt: new Date(`2026-09-0${2 + (i % 5)}T03:00:00Z`) }));
  const leads = [
    ...Array.from({ length: 6 }, () => ({ categoryCode: "hvac.no_cool", returning: true })),
    ...Array.from({ length: 6 }, () => ({ categoryCode: "hvac.maintenance", returning: false })),
    ...Array.from({ length: 2 }, () => ({ categoryCode: "hvac.system_replace", returning: false })),
  ];
  const patterns = learnShopPatterns({ calls: [...mondayMorning, ...lateNights], leads, hoursJson: "{}", timezone: NY });
  const keys = patterns.map((p) => p.key);
  assert.ok(keys.includes("busiest"), JSON.stringify(patterns));
  assert.match(patterns.find((p) => p.key === "busiest").text, /^Your busiest stretch is Tuesdays 8 AM–10 AM|^Your busiest stretch is \w+s /);
  assert.ok(keys.includes("after_hours"));
  assert.ok(keys.includes("returning"));
  assert.match(patterns.find((p) => p.key === "returning").text, /About 1 in 2 callers/);
});

test("one pattern a day, rotating, the same all day", () => {
  const patterns = [
    { key: "busiest", text: "A" },
    { key: "after_hours", text: "B" },
  ];
  const morning = composePersonalBrief({ ...base, patterns, now: new Date("2026-09-25T12:00:00Z") });
  const evening = composePersonalBrief({ ...base, patterns, now: new Date("2026-09-25T23:00:00Z") });
  const tomorrow = composePersonalBrief({ ...base, patterns, now: new Date("2026-09-26T12:00:00Z") });
  assert.equal(morning.pattern, evening.pattern);
  assert.notEqual(morning.pattern, tomorrow.pattern);
  assert.equal(composePersonalBrief({ ...base, now: new Date() }).pattern, null);
});
