import assert from "node:assert/strict";
import test from "node:test";

import {
  findAvailableSchedule,
  fitsShopHours,
  formatShopTime,
  overlappingJobs,
} from "../src/lib/availability.ts";

const WEEK = JSON.stringify({
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "00:00", close: "00:00", closed: true },
  sunday: { open: "00:00", close: "00:00", closed: true },
});

const NY = "America/New_York";

test("an emergency gets the earliest real opening in the shop timezone", () => {
  const slot = findAvailableSchedule({
    // Tue Sep 8, 2026, 8:00am EDT.
    now: new Date("2026-09-08T12:00:00.000Z"),
    urgency: "emergency",
    hoursJson: WEEK,
    timezone: NY,
    existing: [],
    capacity: 1,
  });

  assert.equal(slot?.toISOString(), "2026-09-08T12:30:00.000Z");
  assert.match(formatShopTime(slot, NY), /Tue, Sep 8, 8:30 AM EDT/);
});

test("the complete job must fit before closing", () => {
  assert.equal(
    fitsShopHours({
      start: new Date("2026-09-08T18:30:00.000Z"), // 2:30pm EDT
      durationMin: 120,
      hoursJson: WEEK,
      timezone: NY,
    }),
    true,
  );
  assert.equal(
    fitsShopHours({
      start: new Date("2026-09-08T19:30:00.000Z"), // 3:30pm EDT
      durationMin: 120,
      hoursJson: WEEK,
      timezone: NY,
    }),
    false,
    "a 3:30pm two-hour job does not fit into a 5pm close",
  );
});

test("one technician cannot receive two overlapping jobs", () => {
  const existing = [{ scheduledAt: new Date("2026-09-08T13:00:00.000Z") }];

  const slot = findAvailableSchedule({
    now: new Date("2026-09-08T12:00:00.000Z"),
    urgency: "same-day",
    hoursJson: WEEK,
    timezone: NY,
    existing,
    capacity: 1,
  });

  assert.equal(
    slot?.toISOString(),
    "2026-09-08T15:00:00.000Z",
    "9–11am is occupied, so the next two-hour opening is 11am",
  );
});

test("two active technicians make two concurrent windows available", () => {
  const slot = findAvailableSchedule({
    now: new Date("2026-09-08T12:00:00.000Z"),
    urgency: "same-day",
    hoursJson: WEEK,
    timezone: NY,
    existing: [{ scheduledAt: new Date("2026-09-08T13:00:00.000Z") }],
    capacity: 2,
  });

  assert.equal(slot?.toISOString(), "2026-09-08T13:00:00.000Z");
});

test("a full day rolls to the next configured opening", () => {
  const existing = [
    "2026-09-08T12:00:00.000Z",
    "2026-09-08T14:00:00.000Z",
    "2026-09-08T16:00:00.000Z",
    "2026-09-08T18:00:00.000Z",
  ].map((scheduledAt) => ({ scheduledAt: new Date(scheduledAt) }));

  const slot = findAvailableSchedule({
    now: new Date("2026-09-08T12:00:00.000Z"),
    urgency: "emergency",
    hoursJson: WEEK,
    timezone: NY,
    existing,
    capacity: 1,
  });

  assert.equal(slot?.toISOString(), "2026-09-09T12:00:00.000Z");
});

test("weekends are skipped, not booked by server-local date arithmetic", () => {
  const slot = findAvailableSchedule({
    // Fri Sep 11 at noon EDT. Flexible starts searching Saturday, which is shut.
    now: new Date("2026-09-11T16:00:00.000Z"),
    urgency: "flexible",
    hoursJson: WEEK,
    timezone: NY,
    existing: [],
    capacity: 1,
  });

  assert.equal(slot?.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.match(formatShopTime(slot, NY), /Mon, Sep 14, 8:00 AM EDT/);
});

test("the same instant produces different openings in different shop timezones", () => {
  const now = new Date("2026-09-08T20:00:00.000Z"); // 4pm NY, 1pm LA
  const ny = findAvailableSchedule({
    now,
    urgency: "same-day",
    hoursJson: WEEK,
    timezone: NY,
    existing: [],
    capacity: 1,
  });
  const la = findAvailableSchedule({
    now,
    urgency: "same-day",
    hoursJson: WEEK,
    timezone: "America/Los_Angeles",
    existing: [],
    capacity: 1,
  });

  assert.equal(
    ny?.toISOString(),
    "2026-09-09T12:00:00.000Z",
    "a two-hour job no longer fits in New York",
  );
  assert.equal(
    la?.toISOString(),
    "2026-09-08T21:00:00.000Z",
    "the Los Angeles shop still has same-day capacity",
  );
});

test("overlap uses intervals, not matching start timestamps", () => {
  const existing = [{ scheduledAt: new Date("2026-09-08T13:00:00.000Z") }];
  assert.equal(
    overlappingJobs({
      start: new Date("2026-09-08T14:30:00.000Z"),
      durationMin: 120,
      existing,
    }),
    1,
  );
  assert.equal(
    overlappingJobs({
      start: new Date("2026-09-08T15:00:00.000Z"),
      durationMin: 120,
      existing,
    }),
    0,
    "a job ending exactly when the next begins does not overlap",
  );
});

test("invalid timezone config falls back safely instead of crashing booking", () => {
  assert.doesNotThrow(() =>
    findAvailableSchedule({
      now: new Date("2026-09-08T12:00:00.000Z"),
      urgency: "emergency",
      hoursJson: WEEK,
      timezone: "Not/A_Timezone",
      existing: [],
      capacity: 1,
    }),
  );
});
