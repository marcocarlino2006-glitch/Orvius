#!/usr/bin/env node
/*
 * Command's flow and money lines count only what a record proves: a job the
 * customer confirmed, a job the technician accepted, a bill that was paid.
 * Nothing moves forward on status alone, and nothing is counted twice.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { getCommandFlow, getCommandMoney, summarizeFlow } from "../src/lib/command-depth.ts";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOUR = 60 * 60_000;
let shop;

test.after(async () => {
  if (shop) await prisma.business.delete({ where: { id: shop.id } }).catch(() => undefined);
  await prisma.$disconnect();
});

const stage = (flow, key) => flow.stages.find((s) => s.key === key);

test("each step counts only jobs a record moved there, and names what is stuck before it", () => {
  const at = new Date();
  const flow = summarizeFlow({
    windowDays: 7,
    requests: 6,
    jobs: [
      { status: "scheduled", technicianId: null, customerConfirmedAt: null, techAcceptedAt: null, invoices: [] },
      { status: "scheduled", technicianId: "t1", customerConfirmedAt: at, techAcceptedAt: null, invoices: [] },
      { status: "confirmed", technicianId: "t1", customerConfirmedAt: at, techAcceptedAt: at, invoices: [] },
      { status: "completed", technicianId: "t2", customerConfirmedAt: at, techAcceptedAt: at, invoices: [{ status: "sent" }] },
      { status: "completed", technicianId: "t2", customerConfirmedAt: null, techAcceptedAt: at, invoices: [{ status: "paid" }] },
      { status: "cancelled", technicianId: null, customerConfirmedAt: at, techAcceptedAt: at, invoices: [] },
    ],
  });
  assert.equal(stage(flow, "requests").count, 6);
  assert.equal(stage(flow, "booked").count, 5, "a cancelled job is not booked work");
  assert.equal(stage(flow, "booked").waitingLabel, "1 not booked");
  assert.equal(stage(flow, "confirmed").count, 3);
  assert.equal(stage(flow, "confirmed").waitingLabel, "1 waiting on the customer", "only open jobs wait on a customer");
  assert.equal(stage(flow, "accepted").count, 3);
  assert.equal(stage(flow, "accepted").waitingLabel, "1 unassigned · 1 not accepted yet");
  assert.equal(stage(flow, "done").count, 2);
  assert.equal(stage(flow, "paid").count, 1, "a sent bill is not paid");
  assert.equal(stage(flow, "paid").waitingLabel, "1 not paid yet");
});

test("an empty shop shows zeros and nothing stuck, never a made-up number", () => {
  const flow = summarizeFlow({ windowDays: 7, requests: 0, jobs: [] });
  assert.ok(flow.stages.every((s) => s.count === 0 && s.waiting === 0));
});

test("money reads billed, collected and owed from invoices and payments in the window", async () => {
  shop = await prisma.business.create({
    data: { name: "Depth Heating", slug: `depth-${stamp()}`, trade: "HVAC", timezone: "America/Chicago", servicesJson: "[]", environment: "demo" },
  });
  const job = (status, extra = {}) =>
    prisma.job.create({ data: { businessId: shop.id, title: "AC repair", status, completedAt: status === "completed" ? new Date() : null, ...extra } });
  const paidJob = await job("completed");
  const owedJob = await job("completed");
  await job("completed");
  await job("completed", { completedAt: new Date(Date.now() - 30 * 24 * HOUR) });
  await job("scheduled");

  const paid = await prisma.invoice.create({
    data: { businessId: shop.id, jobId: paidJob.id, amountCents: 40_000, status: "paid", sentAt: new Date(), paidAt: new Date() },
  });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: paid.id, amountCents: 40_000, status: "recorded" } });
  const owed = await prisma.invoice.create({ data: { businessId: shop.id, jobId: owedJob.id, amountCents: 25_000, status: "partial", sentAt: new Date() } });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: owed.id, amountCents: 5_000, status: "recorded" } });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: owed.id, amountCents: 9_999, status: "superseded" } });
  await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 99_000, status: "draft" } });
  await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 77_000, status: "void", sentAt: new Date() } });

  const money = await getCommandMoney(shop.id);
  assert.equal(money.invoicedCents, 65_000, "drafts and voided bills were never billed");
  assert.equal(money.invoices, 2);
  assert.equal(money.collectedCents, 45_000, "a superseded payment is not money in");
  assert.equal(money.payments, 2);
  assert.equal(money.outstandingCents, 20_000, "owed is the open balance, not the bill");
  assert.equal(money.outstandingInvoices, 1);
  assert.equal(money.doneNotBilled, 1, "an old job and a scheduled one are not this week's missing bills");

  const flow = await getCommandFlow(shop.id);
  assert.equal(stage(flow, "booked").count, 5);
  assert.equal(stage(flow, "done").count, 4);
  assert.equal(stage(flow, "paid").count, 1);
});
