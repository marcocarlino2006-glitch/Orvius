#!/usr/bin/env node
/*
 * Owner reports: the numbers an owner runs the shop on come straight from the
 * shop's own paid invoices, deposits, estimates and jobs, on the shop's clock,
 * with no rate shown on too few samples and no spreadsheet formula injection.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { buildOwnerReport, reportCsv, reportWindow, summarizeReport } from "../src/lib/owner-report.ts";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const empty = { money: [], previousMoney: [], estimates: [], jobs: [], callLeads: [], technicians: [] };

test("summary adds up collected money per technician and per channel", () => {
  const r = summarizeReport({
    ...empty,
    technicians: [{ id: "t1", name: "Ana" }, { id: "t2", name: "Ben" }],
    money: [
      { amountCents: 40000, technicianId: "t1", source: "call", kind: "invoice" },
      { amountCents: 20000, technicianId: "t1", source: "booking_page", kind: "invoice" },
      { amountCents: 5000, technicianId: "t2", source: "call", kind: "deposit" },
      { amountCents: 1000, technicianId: "gone", source: "weird", kind: "deposit" },
    ],
    previousMoney: [{ amountCents: 30000 }],
    jobs: [{ technicianId: "t1" }, { technicianId: "t2" }, { technicianId: null }],
  });
  assert.equal(r.collectedCents, 66000);
  assert.equal(r.previousCollectedCents, 30000);
  assert.equal(r.payments, 4);
  assert.equal(r.averageInvoiceCents, 30000, "deposits are not invoices");
  assert.equal(r.jobsCompleted, 3);
  assert.deepEqual(r.byTechnician.map((t) => [t.label, t.collectedCents]), [["Ana", 60000], ["Ben", 5000], ["No technician assigned", 1000]]);
  assert.deepEqual(r.bySource.map((s) => [s.label, s.collectedCents]), [["Phone calls", 45000], ["Booking page", 20000], ["Added by your team", 1000]]);
});

test("no rate is shown until there are enough samples", () => {
  const two = summarizeReport({ ...empty, estimates: [{ amountCents: 100, won: true, technicianId: null }, { amountCents: 100, won: false, technicianId: null }], callLeads: [{ booked: true }] });
  assert.equal(two.estimates.closeRate, null);
  assert.equal(two.calls.bookedRate, null);
  assert.equal(two.averageInvoiceCents, null);
  const four = summarizeReport({
    ...empty,
    estimates: [true, true, false, false].map((won) => ({ amountCents: 500, won, technicianId: null })),
    callLeads: [{ booked: true }, { booked: false }, { booked: false }],
  });
  assert.equal(four.estimates.closeRate, 0.5);
  assert.equal(four.estimates.wonCents, 1000);
  assert.equal(Math.round(four.calls.bookedRate * 100), 33);
});

test("months start at midnight on the shop's clock and this month compares to the same days last month", () => {
  const now = new Date("2026-03-15T12:00:00Z");
  const w = reportWindow("this_month", "America/Chicago", now);
  assert.equal(w.start.toISOString(), "2026-03-01T06:00:00.000Z");
  assert.equal(w.prevStart.toISOString(), "2026-02-01T06:00:00.000Z");
  assert.equal(w.prevEnd.getTime() - w.prevStart.getTime(), now.getTime() - w.start.getTime());
  const last = reportWindow("last_month", "America/Chicago", now);
  assert.equal(last.start.toISOString(), "2026-02-01T06:00:00.000Z");
  assert.equal(last.end.toISOString(), "2026-03-01T06:00:00.000Z");
  const jan = reportWindow("last_month", "America/New_York", new Date("2026-01-10T12:00:00Z"));
  assert.equal(jan.start.toISOString(), "2025-12-01T05:00:00.000Z");
  const ninety = reportWindow("last_90", "America/Chicago", now);
  assert.equal(ninety.end.getTime() - ninety.start.getTime(), 90 * 86_400_000);
});

test("the report reads only this shop's paid money inside the window", async () => {
  const now = new Date("2026-03-20T15:00:00Z");
  const shop = await prisma.business.create({
    data: { name: "Report Air", slug: `rp-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  const other = await prisma.business.create({
    data: { name: "Other Air", slug: `rp-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  made.push(shop.id, other.id);
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana" } });
  const lead = await prisma.lead.create({ data: { businessId: shop.id, source: "call", createdAt: new Date("2026-03-05T15:00:00Z") } });
  await prisma.lead.create({ data: { businessId: shop.id, source: "call", createdAt: new Date("2026-03-06T15:00:00Z") } });
  const job = await prisma.job.create({
    data: { businessId: shop.id, leadId: lead.id, technicianId: tech.id, title: "No heat", status: "completed", completedAt: new Date("2026-03-06T18:00:00Z") },
  });
  await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 45000, status: "paid", paidAt: new Date("2026-03-06T19:00:00Z") } });
  await prisma.deposit.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 5000, status: "paid", paidAt: new Date("2026-03-04T19:00:00Z") } });
  await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 99999, status: "sent" } });
  await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 77777, status: "paid", paidAt: new Date("2026-03-01T05:30:00Z") } });
  await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 12000, status: "paid", paidAt: new Date("2026-02-10T19:00:00Z") } });
  await prisma.invoice.create({ data: { businessId: other.id, amountCents: 88888, status: "paid", paidAt: new Date("2026-03-06T19:00:00Z") } });

  const { report, timezone } = await buildOwnerReport(shop.id, "this_month", now);
  assert.equal(timezone, "America/Chicago");
  assert.equal(report.collectedCents, 50000, "unpaid, other-shop, and before-midnight-local money stay out");
  assert.equal(report.previousCollectedCents, 12000, "compared against Feb 1-20 only, the same days elapsed");
  const feb = await buildOwnerReport(shop.id, "last_month", now);
  assert.equal(feb.report.collectedCents, 12000 + 77777, "Feb 28 11:30pm Chicago belongs to February");
  assert.equal(report.jobsCompleted, 1);
  assert.equal(report.calls.leads, 2);
  assert.equal(report.calls.booked, 1);
  assert.deepEqual(report.byTechnician.map((t) => [t.label, t.collectedCents]), [["Ana", 50000]]);
  assert.deepEqual(report.bySource.map((s) => [s.label, s.collectedCents]), [["Phone calls", 50000]]);
});

test("CSV export cannot smuggle a spreadsheet formula", () => {
  const csv = reportCsv(
    summarizeReport({
      ...empty,
      technicians: [{ id: "t1", name: "=HYPERLINK(\"http://x\")" }, { id: "t2", name: "Smith, Jr" }],
      money: [
        { amountCents: 100, technicianId: "t1", source: null, kind: "invoice" },
        { amountCents: 200, technicianId: "t2", source: null, kind: "invoice" },
      ],
    }),
  );
  assert.ok(!/(^|,)=/m.test(csv), "no cell starts with =");
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(csv, /"Smith, Jr"/);
});

test("reports are owner and manager only and errors are plain text", () => {
  const route = read("src/app/api/reports/route.ts");
  assert.match(route, /requirePermission\("reports\.view"\)/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: error/);
  const labels = read("src/lib/workspace-access-labels.ts");
  assert.match(labels, /reports\.view/);
  assert.match(read("src/lib/os-nav.ts"), /\/dashboard\/reports/);
  assert.match(read("src/components/os-sidebar-footer.tsx"), /can\(account\.role, "reports\.view"\)/);
});
