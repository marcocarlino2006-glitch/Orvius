#!/usr/bin/env node
/*
 * Work: one list of every customer request from first call to last payment.
 * A request and the job it becomes are one item at two stages, each with a
 * stage, a person responsible and a next action every screen agrees on.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

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
  assert.equal(owes.nextAction, "Waiting on Dana to pay");
  assert.equal(owes.waitingOn, "customer");
  const draft = work.jobWorkItem(job({ status: "completed", invoices: [{ status: "draft", paidAt: null, amountCents: 100 }] }));
  assert.equal(draft.nextAction, "Send the invoice");
  assert.equal(draft.needsYou, true);
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

test("problems found by the paging rules land on the work they are about; shop problems stay apart", () => {
  const board = {
    exceptions: [
      { id: "stale:j1", lane: "exceptions", exception: "stale", title: "t", detail: "Window was Mon and nobody is on the way", at: "", jobId: "j1" },
      { id: "alert-setup:x", lane: "exceptions", exception: "alert_setup", title: "Your alerts aren't reaching you", detail: "2 failed", at: "" },
      { id: "text-failed:m", lane: "exceptions", exception: "failed_message", title: "t", detail: "body", at: "", phone: "+17205550100" },
    ],
    approvals: [],
  };
  const attention = [
    { id: "a", kind: "open_invoice", rank: 1, impact: "high", title: "Dana · invoice", detail: "Invoice sent, not paid yet", recommendedAction: "Call", href: "/dashboard/jobs/j2", entityType: "shop", entityId: "b", createdAt: "" },
    { id: "b", kind: "new_lead", rank: 1, impact: "high", title: "x", detail: "x", recommendedAction: "x", href: "/dashboard/inbox/l1", entityType: "lead", entityId: "l1", createdAt: "" },
    { id: "c", kind: "billing_action", rank: 1, impact: "critical", title: "Payment failed", detail: "d", recommendedAction: "Open billing", href: "/dashboard/billing", entityType: "shop", entityId: "b", createdAt: "" },
  ];
  const out = work.problemsFrom(board, attention);
  assert.deepEqual(out.byJob.get("j1").map((p) => p.label), ["Window passed"]);
  assert.deepEqual(out.byJob.get("j2").map((p) => p.label), ["Invoice unpaid"]);
  assert.equal(out.byLead.has("l1"), false, "a new request is its stage, not a problem");
  assert.deepEqual(out.byPhone.get("7205550100").map((p) => p.kind), ["failed_message"]);
  assert.deepEqual(out.shop.map((i) => i.title).sort(), ["Payment failed", "Your alerts aren't reaching you"]);
});

test("a job whose window passed is one problem that needs you; a job waiting on the customer does not", async () => {
  const shop = await makeShop();
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ray Diaz", phone: phone() } });
  const customerPhone = phone();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Kim", phone: customerPhone, phoneNormalized: customerPhone } });
  const hour = 60 * 60 * 1000;
  const late = await prisma.job.create({
    data: {
      businessId: shop.id, customerId: customer.id, technicianId: tech.id, title: "Tune-up", status: "confirmed",
      scheduledAt: new Date(Date.now() - 3 * hour), customerConfirmedAt: new Date(Date.now() - 20 * hour),
    },
  });
  const waiting = await prisma.job.create({
    data: {
      businessId: shop.id, customerId: customer.id, technicianId: tech.id, title: "Filter swap", status: "scheduled",
      scheduledAt: new Date(Date.now() + 30 * hour), customerConfirmSentAt: new Date(),
    },
  });

  const board = await work.listWork(shop.id, "open");
  const lateItem = board.items.find((i) => i.id === late.id);
  assert.deepEqual(lateItem.problems.map((p) => p.label), ["Window passed"], "tech late, at risk and no-show are folded into the one fact");
  assert.equal(lateItem.needsYou, true);
  assert.doesNotMatch(lateItem.problems[0].detail, /Tech: /);

  const waitingItem = board.items.find((i) => i.id === waiting.id);
  assert.equal(waitingItem.waitingOn, "customer");
  assert.equal(waitingItem.nextAction, "Waiting on Kim to confirm");
  assert.equal(waitingItem.needsYou, false);

  assert.equal(board.needsYou, board.items.filter((i) => i.needsYou).length);
  assert.equal(board.items[0].id, late.id, "what needs you sorts first");
});

test("Command, the nav badge and the Work screen read the same count", async () => {
  const ring1 = await import("../src/app/api/ring1/route.ts");
  const route = await import("../src/app/api/work/route.ts");
  const shop = await makeShop();
  await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "new", name: "One" } });
  await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "contacted", name: "Two" } });
  signedInAs = shop.ownerEmail;

  const command = await (await ring1.GET(new Request("http://localhost/api/ring1"))).json();
  const listed = await (await route.GET(new Request("http://localhost/api/work"))).json();
  assert.equal(command.work.needsYou, 2);
  assert.equal(listed.needsYou, command.work.needsYou);
  assert.deepEqual(command.work.items.map((i) => i.key).sort(), listed.items.filter((i) => i.needsYou).map((i) => i.key).sort());
  assert.match(command.personalBrief?.headline ?? "", /2 things|2 need|One step left|line is live/);
});

test("a booked request opens as its job, and its history runs from the call to the technician's text", async () => {
  const { workHistory } = await import("../src/lib/work-history.ts");
  const shop = await makeShop();
  const caller = phone();
  const techPhone = phone();
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ray Diaz", phone: techPhone } });
  const request = await prisma.lead.create({ data: { businessId: shop.id, phone: caller, name: "Ana", serviceType: "Leak repair", status: "booked" } });
  const booked = await prisma.job.create({ data: { businessId: shop.id, leadId: request.id, technicianId: tech.id, title: "Leak repair", status: "scheduled", scheduledAt: new Date(Date.now() + 86_400_000) } });
  const t0 = booked.createdAt.getTime() + 5000;
  await prisma.message.create({ data: { businessId: shop.id, phoneNormalized: caller, direction: "in", author: "customer", body: "Pipe burst under the sink", createdAt: new Date(t0 - 3000) } });
  await prisma.message.create({ data: { businessId: shop.id, phoneNormalized: caller, direction: "out", author: "orvius", body: "You're booked", deliveryStatus: "failed", createdAt: new Date(t0 - 2000) } });
  await prisma.outboundSms.create({ data: { businessId: shop.id, toNormalized: techPhone, audience: "tech", sid: "SIM_tech", body: "New job: Ana, Leak repair", jobId: booked.id, createdAt: new Date(t0 - 1000) } });
  const later = await prisma.job.create({ data: { businessId: shop.id, technicianId: tech.id, title: "Drain clog", status: "scheduled" } });
  await prisma.outboundSms.create({ data: { businessId: shop.id, toNormalized: techPhone, audience: "tech", sid: "SIM_tech2", body: "New job: Drain clog", jobId: later.id, createdAt: new Date(t0 - 500) } });
  await prisma.auditEvent.create({ data: { businessId: shop.id, actor: "owner", actorEmail: shop.ownerEmail, action: "job.status", entityType: "job", entityId: booked.id, summary: "Moved to tomorrow" } });

  const item = await work.getWorkItem(shop.id, "request", request.id);
  assert.equal(item.key, `job:${booked.id}`, "a request that was booked is the job now");
  assert.equal(await work.getWorkItem(shop.id, "request", "not-a-lead"), null);

  const fromRequest = await workHistory(shop.id, { kind: "request", id: request.id });
  const fromJob = await workHistory(shop.id, { kind: "job", id: booked.id });
  assert.deepEqual(fromRequest.map((e) => e.id), fromJob.map((e) => e.id), "the request and its job tell one story");
  const titles = fromJob.map((e) => e.title);
  assert.ok(titles.includes("Customer texted"));
  assert.ok(titles.includes("Texted Ray Diaz"), "the proof the technician was told");
  assert.ok(!fromJob.some((e) => /Drain clog/.test(e.detail ?? "")), "texts about the technician's other jobs stay on those jobs");
  assert.ok(titles.includes("Moved to tomorrow"));
  assert.equal(fromJob.find((e) => e.title === "Texted the customer").tone, "failed");
  assert.equal(fromJob.find((e) => e.title === "Moved to tomorrow").who, "person");
  const at = fromJob.map((e) => new Date(e.at).getTime());
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "in the order it happened");

  const other = await makeShop();
  assert.equal(await workHistory(other.id, { kind: "job", id: booked.id }), null, "another shop sees nothing");
});

test("/api/work/item returns the work, its history and who can take it — only for the shop's own work", async () => {
  const route = await import("../src/app/api/work/item/route.ts");
  const shop = await makeShop();
  const request = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), status: "new", name: "Bo" } });
  const get = (q) => route.GET(new Request(`http://localhost/api/work/item?${q}`));

  signedInAs = shop.ownerEmail;
  const res = await get(`kind=request&id=${request.id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.item.id, request.id);
  assert.ok(Array.isArray(body.history));
  assert.ok(body.assignees.some((a) => a.role === "owner"));
  assert.equal((await get(`kind=nope&id=${request.id}`)).status, 400);

  const other = await makeShop();
  signedInAs = other.ownerEmail;
  assert.equal((await get(`kind=request&id=${request.id}`)).status, 404);
});

test("a time typed on a request or a job is read on the shop's clock, not the browser's", async () => {
  const { shopWallInputToUtc } = await import("../src/lib/availability.ts");
  const { shopWallInput, formatShopTime } = await import("../src/lib/when.ts");
  assert.equal(shopWallInputToUtc("2026-10-07T11:30", "America/Chicago").toISOString(), "2026-10-07T16:30:00.000Z");
  assert.equal(shopWallInputToUtc("next tuesday", "America/Chicago"), null);
  assert.equal(shopWallInput("2026-10-07T16:30:00.000Z", "America/Chicago"), "2026-10-07T11:30");
  assert.match(formatShopTime("2026-10-07T16:30:00.000Z", "America/Chicago"), /Wednesday, October 7 at 11:30\sAM CDT/);

  const jobs = await import("../src/app/api/jobs/route.ts");
  const jobRoute = await import("../src/app/api/jobs/[id]/route.ts");
  const shop = await makeShop();
  await prisma.business.update({ where: { id: shop.id }, data: { timezone: "America/Chicago" } });
  const request = await prisma.lead.create({ data: { businessId: shop.id, phone: phone(), name: "Cy", serviceType: "Leak repair", address: "1 Main St", status: "new" } });
  signedInAs = shop.ownerEmail;
  const res = await jobs.POST(new Request("http://localhost/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId: request.id, scheduledLocal: "2026-11-03T09:00" }) }));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(new Date(body.job.scheduledAt).toISOString(), "2026-11-03T15:00:00.000Z", "9 AM Chicago, after the clocks change");

  const moved = await jobRoute.PATCH(
    new Request(`http://localhost/api/jobs/${body.job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledLocal: "2026-11-04T14:15" }) }),
    { params: Promise.resolve({ id: body.job.id }) },
  );
  assert.equal(moved.status, 200);
  const row = await prisma.job.findUnique({ where: { id: body.job.id } });
  assert.equal(row.scheduledAt.toISOString(), "2026-11-04T20:15:00.000Z");

  await prisma.job.update({ where: { id: body.job.id }, data: { status: "confirmed", customerConfirmedAt: new Date() } });
  await jobRoute.PATCH(
    new Request(`http://localhost/api/jobs/${body.job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledLocal: "2026-11-05T08:00" }) }),
    { params: Promise.resolve({ id: body.job.id }) },
  );
  const reopened = await prisma.job.findUnique({ where: { id: body.job.id } });
  assert.equal(reopened.status, "scheduled", "a new time is not confirmed until the customer says so");
  assert.equal(reopened.customerConfirmedAt, null);
  const bad = await jobRoute.PATCH(
    new Request(`http://localhost/api/jobs/${body.job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledLocal: "soon" }) }),
    { params: Promise.resolve({ id: body.job.id }) },
  );
  assert.equal(bad.status, 422);
});
