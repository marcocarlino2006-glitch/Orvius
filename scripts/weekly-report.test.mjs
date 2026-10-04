import assert from "node:assert/strict";
import test from "node:test";

const { buildWeeklyReportEmail, weeklyReportDue } = await import("../src/lib/weekly-report.ts");

function outcomes(overrides = {}) {
  return {
    windowDays: 7,
    since: "2026-09-19T00:00:00.000Z",
    calls: 14,
    leads: 11,
    jobsBooked: 6,
    leadsBooked: 6,
    bookingRate: 55,
    afterHoursLeads: 4,
    afterHoursBooked: 3,
    emergenciesBooked: 1,
    unassignedJobs: 2,
    activeTechnicians: 2,
    jobsPerTech: 3,
    avgTicketCents: 45000,
    estimatedPipelineCents: null,
    estimatedLeadValueCents: null,
    baselineMissedCallsPerWeek: null,
    baselineJobsPerWeek: null,
    callsPerWeekVsBaseline: null,
    jobsPerWeekVsBaseline: null,
    capturedDemandJobs: 5,
    jobsCompleted: 3,
    capturedDemandEstimatedValueCents: 225000,
    collectedCents: 90000,
    openEstimateCents: 0,
    openInvoiceCents: 0,
    economicsReady: true,
    weeks: [
      { start: "2026-09-07", leads: 8, booked: 4, partial: false },
      { start: "2026-09-14", leads: 11, booked: 6, partial: false },
      { start: "2026-09-21", leads: 2, booked: 1, partial: true },
    ],
    ...overrides,
  };
}

test("the Monday email states measured counts and labels every dollar", () => {
  const { subject, text } = buildWeeklyReportEmail(outcomes(), "Summit HVAC", "https://app.orvius.im/dashboard");
  assert.equal(subject, "Summit HVAC last week: 14 calls answered, 6 jobs booked");
  assert.match(text, /• 14 calls answered/);
  assert.match(text, /• 4 after-hours requests, 3 booked/);
  assert.match(text, /• 1 emergency booked/);
  assert.match(text, /• \$900 in payments you recorded/);
  assert.match(text, /About \$2,250 in work from calls Orvius answered \(5 jobs at your average ticket\)/);
  assert.match(text, /Booked from calls: 6 this week vs 4 the week before\./);
  assert.match(text, /2 jobs still need a technician\./);
  assert.match(text, /See every call: https:\/\/app\.orvius\.im\/dashboard/);
});

test("no invented money: without an average ticket or payments there are no dollar lines", () => {
  const { text } = buildWeeklyReportEmail(
    outcomes({ capturedDemandEstimatedValueCents: null, collectedCents: 0 }),
    "Summit HVAC",
    "https://x",
  );
  assert.doesNotMatch(text, /\$/);
});

test("a silent week says so and points at call forwarding", () => {
  const { subject, text } = buildWeeklyReportEmail(outcomes({ calls: 0, leads: 0, jobsBooked: 0 }), "Summit HVAC", "https://x");
  assert.equal(subject, "Summit HVAC: no calls reached your line last week");
  assert.match(text, /check that your shop number forwards to it/);
});

test("sent once a week, never in a shop's first week", () => {
  const now = new Date("2026-09-28T13:00:00Z");
  const day = 24 * 60 * 60_000;
  const old = new Date(now.getTime() - 30 * day);
  assert.equal(weeklyReportDue({ createdAt: new Date(now.getTime() - 3 * day), weeklyReportSentAt: null }, now), false);
  assert.equal(weeklyReportDue({ createdAt: old, weeklyReportSentAt: null }, now), true);
  assert.equal(weeklyReportDue({ createdAt: old, weeklyReportSentAt: new Date(now.getTime() - 2 * day) }, now), false);
  assert.equal(weeklyReportDue({ createdAt: old, weeklyReportSentAt: new Date(now.getTime() - 7 * day) }, now), true);
});
