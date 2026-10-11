import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  buildScoreboardEmail,
  getCompanyScoreboard,
  retentionFrom,
  scoreboardLines,
  sendFounderScoreboard,
} from "../src/lib/company-scoreboard.ts";
import { prisma } from "../src/lib/prisma.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const created = [];
let counter = 0;

async function shop(data = {}) {
  const business = await prisma.business.create({
    data: { name: "Board Test HVAC", slug: `board-${Date.now()}-${counter++}`, ...data },
  });
  created.push(business.id);
  return business;
}

after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: "founder-scoreboard", externalId: { startsWith: "2031-" } } });
  await prisma.$disconnect();
});

const minus = (a, b) =>
  Object.fromEntries(
    Object.entries(a).map(([key, value]) => [key, typeof value === "number" ? value - (b[key] ?? 0) : value]),
  );

test("the board counts real shops' calls, bookings and money, and ignores test and demo shops", async () => {
  const now = new Date();
  const before = await getCompanyScoreboard(now);

  const real = await shop({ billingStatus: "active", createdAt: new Date(now.getTime() - 2 * DAY), lineVerifiedAt: now });
  const demo = await shop({ environment: "demo", billingStatus: "active" });
  await shop({ billingStatus: "canceled", canceledAt: new Date(now.getTime() - DAY) });

  for (const status of ["ended", "ended", "failed"]) {
    await prisma.call.create({ data: { businessId: real.id, vapiCallId: `bd_${Date.now()}_${counter++}`, status } });
  }
  await prisma.call.create({
    data: { businessId: real.id, vapiCallId: `bd_stuck_${counter++}`, status: "in-progress", createdAt: new Date(now.getTime() - 3 * HOUR) },
  });
  await prisma.call.create({ data: { businessId: demo.id, vapiCallId: `bd_demo_${counter++}`, status: "failed" } });

  const answered = await prisma.call.create({ data: { businessId: real.id, vapiCallId: `bd_ans_${counter++}`, status: "ended" } });
  const booked = await prisma.lead.create({ data: { businessId: real.id, callId: answered.id, name: "Ann", phone: "+15125550101", status: "booked" } });
  await prisma.lead.create({ data: { businessId: real.id, name: "Bo", phone: "+15125550102", status: "new" } });
  await prisma.job.create({
    data: { businessId: real.id, leadId: booked.id, title: "AC not cooling", createdAt: new Date(now.getTime() - DAY), customerConfirmedAt: now },
  });
  await prisma.job.create({
    data: { businessId: real.id, title: "Owner booked by hand", status: "confirmed" },
  });
  await prisma.job.create({
    data: { businessId: real.id, title: "Done", status: "completed", completedAt: now },
  });

  const invoice = await prisma.invoice.create({
    data: { businessId: real.id, amountCents: 50000, status: "paid", paidAt: now, applicationFeeCents: 400 },
  });
  await prisma.payment.create({ data: { businessId: real.id, invoiceId: invoice.id, amountCents: 30000 } });
  await prisma.payment.create({ data: { businessId: real.id, invoiceId: invoice.id, amountCents: 20000, status: "refunded" } });

  const board = await getCompanyScoreboard(new Date(Date.now() + 1000));
  const week = minus(board.thisWeek, before.thisWeek);

  assert.equal(board.payingShops - before.payingShops, 1, "the demo shop and the canceled shop are not paying");
  assert.equal(week.newShops, 2, "the real and the canceled shop were created this week; the demo one never counts");
  assert.equal(week.churnedShops, 1);
  assert.equal(week.calls, 5, "the demo shop's call never counts");
  assert.equal(week.failedCalls, 2, "a call stuck in progress for hours counts as failed");
  assert.equal(week.leads, 2);
  assert.equal(week.leadsBooked, 1);
  assert.equal(week.jobsBooked, 3);
  assert.equal(week.jobsFromOrvius, 1, "only the job from an answered call counts as Orvius's");
  assert.equal(week.jobsCustomerConfirmed, 1, "the office marking a job confirmed is not the customer confirming");
  assert.equal(week.jobsCompleted, 1);
  assert.equal(week.collectedCents, 30000, "refunded money is not collected money");
  assert.equal(week.platformFeeCents, 400, "Orvius's revenue is its fee, not the shop's payment");
  assert.ok(board.signupToFirstJobMinutes != null);
  assert.ok(board.activation30d.signedUp - before.activation30d.signedUp >= 2);
  assert.equal(board.activation30d.lineAnswered - before.activation30d.lineAnswered, 1);
});

test("the numbers read the same in the email as on the board", () => {
  const week = {
    start: "2031-01-06", newShops: 3, churnedShops: 1, calls: 120, failedCalls: 2, answeredCleanPct: 98,
    leads: 40, leadsBooked: 30, bookingRate: 75, jobsBooked: 31, collectedCents: 1250000,
    jobsFromOrvius: 22, jobsCustomerConfirmed: 18, jobsCompleted: 20, platformFeeCents: 9000,
  };
  const board = {
    generatedAt: "2031-01-13T09:00:00.000Z", payingShops: 12, activeShops: 14,
    thisWeek: week, lastWeek: { ...week, bookingRate: 70, jobsBooked: 25 },
    signupToFirstJobMinutes: 95, shopsWithoutFirstJob: 1,
    activation30d: { signedUp: 4, lineAnswered: 3, numberProven: 2 },
    retention: [{ days: 30, started: 10, kept: 9 }, { days: 90, started: 0, kept: 0 }],
  };
  const lines = scoreboardLines(board).join("\n");
  assert.match(lines, /Paying shops: 12 \(14 active\)/);
  assert.match(lines, /Booking rate: 75% of 40 leads \(last week 70%\)/);
  assert.doesNotMatch(lines, /Collected through Orvius/, "a shop's payments are not Orvius revenue");
  assert.match(lines, /Shops' customer payments \(their money, not ours\): \$12,500/);
  assert.match(lines, /Orvius platform fees on card payments: \$90/);
  assert.match(lines, /from calls and texts Orvius answered: 22/);
  assert.match(lines, /Customer confirmed: 18 · completed: 20/);
  assert.match(lines, /4 signed up · 3 had a call answered on their Orvius line \(75%\) · 2 proved their own number reaches Orvius \(50%\)/);
  assert.match(lines, /Signup to first job from an answered call or text: 95 min median/);
  assert.match(lines, /30 days: 9 of 10 still paying \(90%\)/);
  assert.doesNotMatch(lines, /90 days:/, "a window nobody has reached yet is left out, not shown as 0%");
  assert.match(buildScoreboardEmail(board).subject, /12 paying, 31 jobs booked, 98% calls clean/);
});

test("the founder email goes out on Mondays only, once per week", async () => {
  const saved = { founders: process.env.ORVIUS_FOUNDER_EMAILS, resend: process.env.RESEND_API_KEY };
  delete process.env.ORVIUS_FOUNDER_EMAILS;
  try {
    assert.equal((await sendFounderScoreboard(new Date("2031-01-14T09:00:00Z"))).skipped, "not monday");
    process.env.RESEND_API_KEY = "";
    assert.equal((await sendFounderScoreboard(new Date("2031-01-13T09:00:00Z"))).skipped, "email not configured");
    process.env.RESEND_API_KEY = "re_test";
    assert.equal((await sendFounderScoreboard(new Date("2031-01-13T09:00:00Z"))).skipped, "no founder emails");

    process.env.ORVIUS_FOUNDER_EMAILS = "founder@board-test.invalid";
    await prisma.webhookEvent.create({
      data: { source: "orvius", externalId: "2031-W03", eventType: "founder-scoreboard", status: "completed" },
    });
    assert.equal(
      (await sendFounderScoreboard(new Date("2031-01-13T09:00:00Z"))).skipped,
      "already sent this week",
      "a second cron run the same Monday sends nothing",
    );
  } finally {
    for (const [key, value] of [["ORVIUS_FOUNDER_EMAILS", saved.founders], ["RESEND_API_KEY", saved.resend]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("retention counts shops from their first payment, and past due has not left yet", () => {
  const now = new Date("2031-06-01T00:00:00Z");
  const ago = (days) => new Date(now.getTime() - days * DAY);
  const cohorts = retentionFrom(
    [
      { paidSince: ago(100), billingStatus: "active" },
      { paidSince: ago(95), billingStatus: "canceled" },
      { paidSince: ago(40), billingStatus: "past_due" },
      { paidSince: ago(10), billingStatus: "active" },
      { paidSince: null, billingStatus: "active" },
    ],
    now,
  );
  assert.deepEqual(cohorts, [
    { days: 30, started: 3, kept: 2 },
    { days: 90, started: 2, kept: 1 },
  ]);
});
