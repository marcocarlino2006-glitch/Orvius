#!/usr/bin/env node
/*
 * Work: one list of every customer request from first call to last payment.
 * A request and the job it becomes are one item at two stages, each with a
 * stage, a person responsible and a next action every screen agrees on.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { prisma } = await import("../src/lib/prisma.ts");
const work = await import("../src/lib/work.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const phone = () => `+1720${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const made = [];

async function makeShop() {
  const shop = await prisma.business.create({
    data: {
      name: `Work ${uid()}`,
      slug: `work-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "Plumbing",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const now = new Date("2026-10-06T12:00:00Z");
const lead = (over = {}) => ({
  id: "l1",
  name: "Dana",
  phone: "+17205550100",
  serviceType: "Leak repair",
  urgency: null,
  address: null,
  status: "new",
  assigneeEmail: null,
  createdAt: now,
  updatedAt: now,
  ...over,
});
const job = (over = {}) => ({
  id: "j1",
  leadId: null,
  title: "Water heater",
  serviceType: null,
  urgency: null,
  address: null,
  status: "scheduled",
  scheduledAt: now,
  customerConfirmedAt: null,
  assigneeEmail: null,
  technician: null,
  customer: { name: "Dana", phone: "+17205550100" },
  invoices: [],
  createdAt: now,
  updatedAt: now,
  ...over,
});

test("a request's stage and next action follow its status", () => {
  assert.equal(work.requestWorkItem(lead()).nextAction, "Call Dana back");
  assert.equal(work.requestWorkItem(lead({ urgency: "emergency" })).nextAction, "Call Dana back now — emergency");
  assert.equal(work.requestWorkItem(lead({ urgency: "emergency" })).urgent, true);
  assert.equal(work.requestWorkItem(lead({ status: "contacted" })).nextAction, "Pick a time with Dana");
  assert.equal(work.requestWorkItem(lead({ status: "booked" })).nextAction, "Put the booked time on the schedule");
  assert.equal(work.requestWorkItem(lead({ name: null })).nextAction, "Call the caller back");

  const lost = work.requestWorkItem(lead({ status: "lost" }));
  assert.equal(lost.stage, "cancelled");
  assert.equal(lost.open, false);
  assert.equal(lost.nextAction, null);
  assert.equal(work.requestWorkItem(lead({ status: "spam" })).stage, "spam");

  const item = work.requestWorkItem(lead());
  assert.equal(item.key, "request:l1");
  assert.equal(item.href, "/dashboard/inbox/l1");
  assert.deepEqual(item.responsible, { kind: "owner", label: "You", email: null });
});

test("a job's stage and next action follow the visit", () => {
  assert.equal(work.jobWorkItem(job({ scheduledAt: null })).stage, "needs_time");
  assert.equal(work.jobWorkItem(job({ scheduledAt: null })).nextAction, "Set the time");
  assert.equal(work.jobWorkItem(job()).nextAction, "Assign a technician");

  const tech = { id: "t1", name: "Ray" };
  assert.equal(work.jobWorkItem(job({ technician: tech })).nextAction, "Confirm the time with the customer");
  assert.equal(work.jobWorkItem(job({ technician: tech, customerConfirmedAt: now })).nextAction, null);
  assert.equal(work.jobWorkItem(job({ status: "confirmed" })).nextAction, "Assign a technician");
  assert.equal(work.jobWorkItem(job({ status: "en_route", technician: tech })).nextAction, "Mark arrived");
  assert.equal(work.jobWorkItem(job({ status: "on_site", technician: tech })).nextAction, "Mark done");

  const field = work.jobWorkItem(job({ status: "en_route", technician: tech }));
  assert.deepEqual(field.responsible, { kind: "technician", label: "Ray", email: null });
  const assigned = work.jobWorkItem(job({ technician: tech, assigneeEmail: "office@example.test" }));
  assert.equal(assigned.responsible.kind, "teammate");

  const paid = work.jobWorkItem(job({ status: "completed", invoices: [{ status: "paid", paidAt: now, amountCents: 100 }] }));
  assert.equal(paid.stage, "done");
  assert.equal(paid.open, false);
  const owes = work.jobWorkItem(job({ status: "completed", invoices: [{ status: "sent", paidAt: null, amountCents: 100 }] }));
  assert.equal(owes.open, true);
  assert.equal(owes.nextAction, "Collect payment");
  assert.equal(work.jobWorkItem(job({ status: "completed", invoices: [{ status: "void", paidAt: null, amountCents: 1 }] })).open, false);
  assert.equal(work.jobWorkItem(job({ status: "cancelled" })).open, false);
});

test("urgent work sorts first, then work with a next step, then earlier stages", () => {
  const items = [
    work.jobWorkItem(job({ id: "confirmed", status: "confirmed", technician: { id: "t", name: "R" } })),
    work.jobWorkItem(job({ id: "scheduled" })),
    work.requestWorkItem(lead({ id: "callback" })),
    work.requestWorkItem(lead({ id: "emergency", urgency: "emergency", createdAt: new Date(now.getTime() + 1000) })),
  ];
  assert.deepEqual(
    work.sortWork(items).map((i) => i.id),
    ["emergency", "callback", "scheduled", "confirmed"],
  );
});

test("listWork shows a booked request once, as its job, and splits open from closed", async () => {
  const shop = await makeShop();
  const customerPhone = phone();
  const customer = await prisma.customer.create({
    data: { businessId: shop.id, name: "Dana", phone: customerPhone, phoneNormalized: customerPhone },
  });
  const fresh = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "new", name: "Fresh" } });
  const bookedLead = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "booked", name: "Booked" } });
  const bookedJob = await prisma.job.create({
    data: { businessId: shop.id, customerId: customer.id, leadId: bookedLead.id, title: "Drain", status: "scheduled", scheduledAt: now },
  });
  const spam = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "spam" } });
  const done = await prisma.job.create({ data: { businessId: shop.id, customerId: customer.id, title: "Done", status: "completed" } });
  const owing = await prisma.job.create({ data: { businessId: shop.id, customerId: customer.id, title: "Owing", status: "completed" } });
  await prisma.invoice.create({ data: { businessId: shop.id, jobId: owing.id, amountCents: 5000, status: "sent" } });
  const other = await makeShop();
  await prisma.lead.create({ data: { businessId: other.id, phone: phone(), status: "new" } });

  const open = await work.listWork(shop.id, "open");
  assert.deepEqual(open.items.map((i) => i.key).sort(), [`request:${fresh.id}`, `job:${bookedJob.id}`, `job:${owing.id}`].sort());
  assert.equal(open.truncated, false);

  const closed = await work.listWork(shop.id, "closed");
  assert.deepEqual(closed.items.map((i) => i.key).sort(), [`request:${spam.id}`, `job:${done.id}`].sort());
});

test("assignWork only takes teammates and only touches the shop's own work", async () => {
  const shop = await makeShop();
  const dispatcher = `disp-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  const request = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "new" } });

  const outsider = await work.assignWork({ business: shop, kind: "request", id: request.id, email: "stranger@example.test" });
  assert.equal(outsider.ok, false);
  assert.equal(outsider.status, 400);

  assert.deepEqual(await work.assignWork({ business: shop, kind: "request", id: request.id, email: dispatcher.toUpperCase() }), { ok: true });
  assert.equal((await prisma.lead.findUnique({ where: { id: request.id } })).assigneeEmail, dispatcher);

  const other = await makeShop();
  const theirs = await prisma.lead.create({ data: { businessId: other.id, phone: phone(), status: "new" } });
  const cross = await work.assignWork({ business: shop, kind: "request", id: theirs.id, email: dispatcher });
  assert.equal(cross.status, 404);
  assert.equal((await prisma.lead.findUnique({ where: { id: theirs.id } })).assigneeEmail, null);

  assert.deepEqual(await work.assignWork({ business: shop, kind: "request", id: request.id, email: null }), { ok: true });
  assert.equal((await prisma.lead.findUnique({ where: { id: request.id } })).assigneeEmail, null);
});

test("booking a request keeps the person responsible for it", async () => {
  const { createJobFromLead } = await import("../src/lib/job.ts");
  const shop = await makeShop();
  const mate = `mate-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: mate, role: "manager" } });
  const request = await prisma.lead.create({
    data: { businessId: shop.id, phone: phone(), name: "Kai", status: "contacted", assigneeEmail: mate },
  });
  const booked = await createJobFromLead({ leadId: request.id, skipAutoAssign: true });
  const row = await prisma.job.findUnique({ where: { id: booked.job?.id ?? booked.id } });
  assert.equal(row.assigneeEmail, mate);

  const open = await work.listWork(shop.id, "open");
  assert.deepEqual(open.items.map((i) => i.key), [`job:${row.id}`]);
  assert.equal(open.items[0].responsible.email, mate);
});

test("/api/work lists the shop's work for any teammate and records who assigned what", async () => {
  const route = await import("../src/app/api/work/route.ts");
  const shop = await makeShop();
  const dispatcher = `disp-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: dispatcher, role: "dispatcher" } });
  const request = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "new", name: "Lee" } });

  signedInAs = null;
  assert.equal((await route.GET(new Request("http://localhost/api/work"))).status, 401);

  signedInAs = dispatcher;
  const listed = await (await route.GET(new Request("http://localhost/api/work"))).json();
  assert.equal(listed.view, "open");
  assert.deepEqual(listed.items.map((i) => i.id), [request.id]);
  assert.deepEqual(listed.assignees.map((a) => a.role).sort(), ["dispatcher", "owner"]);

  const patch = (body) =>
    route.PATCH(new Request("http://localhost/api/work", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await patch({ kind: "request", id: request.id })).status, 400);
  assert.equal((await patch({ kind: "request", id: request.id, email: dispatcher })).status, 200);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "work.assigned" } });
  assert.equal(audit.entityId, request.id);
  assert.match(audit.summary, new RegExp(`made ${dispatcher} responsible`));
});
