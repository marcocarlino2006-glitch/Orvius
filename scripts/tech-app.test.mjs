#!/usr/bin/env node
/*
 * The technician app: a technician opens their texted link and runs the job
 * from their phone — on the way, arrived, what was done and what it costs,
 * photos, notes, getting paid, finished — and the office sees the same record.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

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
const field = await import("../src/lib/job-field.ts");
const { issueTechAppLink, revokeTechAppLink, notifyTechJobChanged } = await import("../src/lib/tech-app.ts");
const { publicTechnician } = await import("../src/lib/tech-app-link.ts");
const dayRoute = await import("../src/app/api/tech/[token]/route.ts");
const jobRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/route.ts");
const linesRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/lines/route.ts");
const notesRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/notes/route.ts");
const collectRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/collect/route.ts");
const photosRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/photos/route.ts");
const photoRoute = await import("../src/app/api/tech/[token]/jobs/[jobId]/photos/[photoId]/route.ts");
const officeField = await import("../src/app/api/jobs/[id]/field/route.ts");
const officeJob = await import("../src/app/api/jobs/[id]/route.ts");
const appLinkRoute = await import("../src/app/api/technicians/[id]/app-link/route.ts");
const techniciansRoute = await import("../src/app/api/technicians/route.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const CUSTOMER = "+15125550142";
const TECH_PHONE = "+15125550143";
const made = [];
let ip = 0;

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

/* A demo shop with no real line simulates its texts, so every send is recorded without Twilio. */
async function makeShop() {
  const ownerEmail = `owner-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: { name: "Field Air", slug: `field-${Date.now()}-${uid()}`, environment: "demo", timezone: "America/Chicago", ownerEmail, billingStatus: "active", billingPlan: "pro" },
  });
  made.push(shop.id);
  const customer = await prisma.customer.create({ data: { businessId: shop.id, phone: CUSTOMER, phoneNormalized: CUSTOMER, name: "Pat Lee", address: "12 Elm St" } });
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ray Ortiz", phone: TECH_PHONE } });
  const other = await prisma.technician.create({ data: { businessId: shop.id, name: "Sam Diaz", phone: "+15125550144" } });
  const job = await prisma.job.create({
    data: { businessId: shop.id, customerId: customer.id, technicianId: tech.id, title: "AC not cooling", status: "confirmed", scheduledAt: new Date(Date.now() + 60 * 60_000), notes: "Gate code 4411" },
  });
  const link = await issueTechAppLink({ businessId: shop.id, technicianId: tech.id, send: false, actorEmail: ownerEmail, actor: "owner" });
  const token = new URL(link.url).pathname.split("/").pop();
  return { shop, customer, tech, other, job, token, ownerEmail };
}

function req(method, body, headers = {}) {
  ip += 1;
  const init = { method, headers: { "x-forwarded-for": `10.9.${Math.floor(ip / 250)}.${ip % 250}`, ...headers } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  return new Request("http://localhost/api/tech", init);
}

async function call(handler, method, params, body) {
  const res = await handler(req(method, body), { params: Promise.resolve(params) });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  return { status: res.status, data, res };
}

const textsTo = (businessId, phone) =>
  prisma.message.findMany({ where: { businessId, direction: "out", phoneNormalized: phone }, orderBy: { createdAt: "asc" } });
const techTexts = (businessId, phone) =>
  prisma.outboundSms.findMany({ where: { businessId, audience: "tech", toNormalized: phone }, orderBy: { createdAt: "asc" } });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

test("line totals, discounts and input limits", () => {
  assert.equal(field.lineTotalCents({ kind: "labor", quantity: 1.5, unitCents: 9000 }), 13500);
  assert.equal(field.lineTotalCents({ kind: "discount", quantity: 1, unitCents: 2500 }), -2500);
  assert.throws(() => field.cleanLines([{ name: "", kind: "service", quantity: 1, unitCents: 100 }]), field.FieldError);
  assert.throws(() => field.cleanLines([{ name: "Flush", kind: "service", quantity: 0, unitCents: 100 }]), field.FieldError);
  assert.throws(() => field.cleanLines([{ name: "Flush", kind: "service", quantity: 1, unitCents: -5 }]), field.FieldError);
  assert.throws(() => field.cleanLines(Array.from({ length: field.MAX_LINES + 1 }, () => ({ name: "x", kind: "part", quantity: 1, unitCents: 1 }))), field.FieldError);
  assert.equal(field.cleanLines([{ name: "Odd", kind: "bogus", quantity: 1, unitCents: 1 }])[0].kind, "service");
});

test("photos are checked by their bytes, not their name", () => {
  assert.equal(field.sniffImage(PNG), "image/png");
  assert.equal(field.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0])), "image/jpeg");
  assert.equal(field.sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
});

test("the link opens only the technician's own day and jobs", async () => {
  const { shop, tech, other, job, token } = await makeShop();
  const day = await call(dayRoute.GET, "GET", { token });
  assert.equal(day.status, 200);
  assert.equal(day.data.technician.name, "Ray Ortiz");
  const listed = [...day.data.now, ...day.data.late, ...day.data.days.flatMap((d) => d.jobs)];
  assert.deepEqual(listed.map((j) => j.id), [job.id]);

  const detail = await call(jobRoute.GET, "GET", { token, jobId: job.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.data.job.officeNotes, "Gate code 4411");
  assert.equal(detail.data.job.customerPhone, CUSTOMER);

  const theirs = await prisma.job.create({ data: { businessId: shop.id, technicianId: other.id, title: "Not yours", status: "scheduled", scheduledAt: new Date() } });
  assert.equal((await call(jobRoute.GET, "GET", { token, jobId: theirs.id })).status, 404, "another technician's job");
  assert.equal((await call(linesRoute.PUT, "PUT", { token, jobId: theirs.id }, { lines: [] })).status, 404);
  assert.equal((await call(dayRoute.GET, "GET", { token: "x".repeat(32) })).status, 404, "a made-up link");

  const fresh = await prisma.technician.findUniqueOrThrow({ where: { id: tech.id } });
  assert.equal(publicTechnician(fresh).appToken, undefined, "the token never leaves in office APIs");
  assert.equal(publicTechnician(fresh).hasAppLink, true);
});

test("a new link turns the old one off, and turning it off stops it", async () => {
  const { shop, tech, token, ownerEmail } = await makeShop();
  const next = await issueTechAppLink({ businessId: shop.id, technicianId: tech.id, send: true, actorEmail: ownerEmail, actor: "owner" });
  assert.equal(next.sent, true);
  const texts = await techTexts(shop.id, TECH_PHONE);
  assert.ok(texts.at(-1).body.includes(next.url), "texted the new link");
  const { applyMessageReceipt } = await import("../src/lib/messages.ts");
  assert.equal(await applyMessageReceipt({ messageSid: texts.at(-1).sid, messageStatus: "delivered" }), 1);
  assert.equal((await prisma.outboundSms.findUniqueOrThrow({ where: { id: texts.at(-1).id } })).deliveryStatus, "delivered", "the carrier receipt lands on the technician's text");
  assert.equal((await call(dayRoute.GET, "GET", { token })).status, 404, "old link is off");
  const newToken = new URL(next.url).pathname.split("/").pop();
  assert.equal((await call(dayRoute.GET, "GET", { token: newToken })).status, 200);
  await revokeTechAppLink({ businessId: shop.id, technicianId: tech.id, actorEmail: ownerEmail, actor: "owner" });
  assert.equal((await call(dayRoute.GET, "GET", { token: newToken })).status, 404);
  await prisma.technician.update({ where: { id: tech.id }, data: { appToken: newToken } });
  await prisma.technician.update({ where: { id: tech.id }, data: { isActive: false } });
  assert.equal((await call(dayRoute.GET, "GET", { token: newToken })).status, 404, "an inactive technician's link is off");
});

test("on the way and arrived each text the customer once", async () => {
  const { shop, job, token } = await makeShop();
  for (let i = 0; i < 2; i++) assert.equal((await call(jobRoute.PATCH, "PATCH", { token, jobId: job.id }, { status: "en_route", etaText: "20 min" })).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await call(jobRoute.PATCH, "PATCH", { token, jobId: job.id }, { status: "on_site" })).status, 200);
  const texts = (await textsTo(shop.id, CUSTOMER)).map((t) => t.body);
  assert.equal(texts.filter((b) => /on the way/.test(b)).length, 1);
  assert.equal(texts.filter((b) => /has arrived/.test(b)).length, 1);
  const fresh = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(fresh.status, "on_site");
  assert.ok(fresh.dispatchedAt && fresh.onSiteAt);
  const audits = await prisma.auditEvent.findMany({ where: { businessId: shop.id, jobId: job.id, actor: "technician", action: "job.status" } });
  assert.deepEqual(audits.map((a) => a.summary).sort(), ["Ray Ortiz arrived", "Ray Ortiz is on the way"]);
});

test("the work, photos and notes from the field are the office's record too", async () => {
  const { shop, job, token, ownerEmail } = await makeShop();
  const put = await call(linesRoute.PUT, "PUT", { token, jobId: job.id }, {
    lines: [
      { name: "Diagnostic", kind: "service", quantity: 1, unitCents: 8900 },
      { name: "Capacitor", kind: "part", quantity: 2, unitCents: 4500 },
      { name: "Member discount", kind: "discount", quantity: 1, unitCents: 1000 },
    ],
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.linesTotalCents, 16900);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).finalAmountCents, 16900, "the job is billed the line total");

  const form = new FormData();
  form.append("photo", new Blob([PNG], { type: "image/png" }), "a.png");
  form.append("kind", "before");
  const photo = await call(photosRoute.POST, "POST", { token, jobId: job.id }, form);
  assert.equal(photo.status, 200);
  const bad = new FormData();
  bad.append("photo", new Blob(["<svg/>"], { type: "image/png" }), "a.png");
  assert.equal((await call(photosRoute.POST, "POST", { token, jobId: job.id }, bad)).status, 415, "not an image");
  const bytes = await call(photoRoute.GET, "GET", { token, jobId: job.id, photoId: photo.data.photo.id });
  assert.equal(bytes.status, 200);
  assert.equal(bytes.res.headers.get("content-type"), "image/png");

  assert.equal((await call(notesRoute.POST, "POST", { token, jobId: job.id }, { body: "Coil is dirty, quoted cleaning" })).status, 200);

  signedInAs = ownerEmail;
  try {
    const office = await call(officeField.GET, "GET", { id: job.id });
    assert.equal(office.status, 200);
    assert.deepEqual(office.data.lines.map((l) => l.name), ["Diagnostic", "Capacitor", "Member discount"]);
    assert.equal(office.data.photos.length, 1);
    assert.equal(office.data.photos[0].takenBy, "Ray Ortiz");
    assert.equal(office.data.notes[0].authorKind, "technician");
    const edited = await call(officeField.PUT, "PUT", { id: job.id }, { lines: [{ name: "Diagnostic", kind: "service", quantity: 1, unitCents: 8900 }] });
    assert.equal(edited.status, 200);
  } finally {
    signedInAs = null;
  }
  const seen = await call(jobRoute.GET, "GET", { token, jobId: job.id });
  assert.equal(seen.data.linesTotalCents, 8900, "the technician sees the office's edit");
});

test("getting paid in cash locks the work and the finish text goes once", async () => {
  const { shop, job, token } = await makeShop();
  assert.equal((await call(collectRoute.POST, "POST", { token, jobId: job.id }, { method: "cash" })).status, 400, "nothing to collect yet");
  await call(linesRoute.PUT, "PUT", { token, jobId: job.id }, { lines: [{ name: "Tune-up", kind: "service", quantity: 1, unitCents: 12900 }] });
  assert.equal((await call(collectRoute.POST, "POST", { token, jobId: job.id }, { method: "text" })).status, 409, "no card payments in this shop");

  const paid = await call(collectRoute.POST, "POST", { token, jobId: job.id }, { method: "cash" });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.money.invoice.status, "paid");
  assert.equal(paid.data.money.balanceCents, 0);
  const payments = await prisma.payment.findMany({ where: { businessId: shop.id } });
  assert.deepEqual(payments.map((p) => [p.amountCents, p.method]), [[12900, "cash"]]);
  assert.equal((await call(collectRoute.POST, "POST", { token, jobId: job.id }, { method: "check" })).status, 409, "already paid");
  assert.equal((await call(linesRoute.PUT, "PUT", { token, jobId: job.id }, { lines: [] })).status, 409, "paid work is locked");

  assert.equal((await call(jobRoute.PATCH, "PATCH", { token, jobId: job.id }, { status: "completed" })).status, 400, "needs an outcome");
  const done = await call(jobRoute.PATCH, "PATCH", { token, jobId: job.id }, { status: "completed", resolutionCode: "maintenance", resolutionSummary: "Cleaned coil" });
  assert.equal(done.status, 200);
  assert.equal(done.data.job.status, "completed");
  assert.equal((await call(jobRoute.PATCH, "PATCH", { token, jobId: job.id }, { status: "completed", resolutionCode: "maintenance" })).status, 200, "tapping again is harmless");
  const finished = (await textsTo(shop.id, CUSTOMER)).filter((t) => /has finished the job/.test(t.body));
  assert.equal(finished.length, 1);
  assert.match(finished[0].body, /all paid up/);
  const fresh = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(fresh.finalAmountCents, 12900);
  assert.equal(fresh.resolutionCode, "maintenance");
});

test("the technician is texted when their job moves, is cancelled or goes to someone else", async () => {
  const { shop, job, other, ownerEmail } = await makeShop();
  signedInAs = ownerEmail;
  try {
    const moved = await call(officeJob.PATCH, "PATCH", { id: job.id }, { scheduledLocal: "2030-03-04T09:30" });
    assert.equal(moved.status, 200);
    let texts = (await techTexts(shop.id, TECH_PHONE)).map((t) => t.body);
    assert.ok(texts.some((b) => /job moved: AC not cooling for Pat Lee is now .*9:30/.test(b) && b.includes(`/jobs/${job.id}`)), texts.join("\n"));

    const reassigned = await call(officeJob.PATCH, "PATCH", { id: job.id }, { technicianId: other.id });
    assert.equal(reassigned.status, 200);
    texts = (await techTexts(shop.id, TECH_PHONE)).map((t) => t.body);
    assert.ok(texts.some((b) => /you're off a job: AC not cooling/.test(b)));

    await call(officeJob.PATCH, "PATCH", { id: job.id }, { status: "cancelled" });
    const theirs = (await techTexts(shop.id, "+15125550144")).map((t) => t.body);
    assert.ok(theirs.some((b) => /job cancelled: AC not cooling/.test(b)));
  } finally {
    signedInAs = null;
  }
  const quiet = await notifyTechJobChanged({ jobId: "nope", technicianId: "nope", change: "moved" });
  assert.equal(quiet.sent, false, "never throws");
});

test("the office can copy the current link without breaking it, and lists never carry the token", async () => {
  const { tech, token, ownerEmail } = await makeShop();
  signedInAs = ownerEmail;
  try {
    const got = await call(appLinkRoute.GET, "GET", { id: tech.id });
    assert.equal(got.status, 200);
    assert.ok(got.data.url.endsWith(`/tech/${token}`));
    assert.equal((await call(dayRoute.GET, "GET", { token })).status, 200, "still works");
    const list = await techniciansRoute.GET(req("GET"));
    const body = await list.json();
    const row = body.technicians.find((t) => t.id === tech.id);
    assert.equal(row.hasAppLink, true);
    assert.equal(JSON.stringify(body).includes(token), false);
    const dispatch = await import("../src/app/api/dispatch/route.ts");
    const board = await (await dispatch.GET(new Request("http://localhost/api/dispatch"))).json();
    assert.ok(board.crew.some((t) => t.id === tech.id));
    assert.equal(JSON.stringify(board).includes(token), false, "the dispatch board never carries the token");
  } finally {
    signedInAs = null;
  }
});
