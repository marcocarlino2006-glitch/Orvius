#!/usr/bin/env node
/*
 * The technician's phone in the field: a checklist that fits the visit and
 * keeps readings, the customer's sign-off on the work and total, and updates
 * made without signal that land once, in order, at the time they happened,
 * without texting a customer "on the way" an hour late.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { applyChecklist, checklistTemplateFor, readChecklist, CHECKLIST_TEMPLATES } from "../src/lib/job-checklist.ts";
import { addJobNote, jobField, setJobChecklist, setJobLines } from "../src/lib/job-field.ts";
import { saveJobSignature, signatureStatement } from "../src/lib/job-signature.ts";
import { fieldTime, techForToken, techJobDetail, techUpdateJob } from "../src/lib/tech-app.ts";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

async function shopWithJob(trade = "HVAC", job = {}) {
  const shop = await prisma.business.create({
    data: { name: "Field Air", slug: `fa-${stamp()}`, trade, hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  made.push(shop.id);
  const token = `tok-${stamp()}-abcdefghijklmnop`;
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana Ruiz", appToken: token, isActive: true } });
  const row = await prisma.job.create({
    data: { businessId: shop.id, technicianId: tech.id, title: "AC not cooling", categoryCode: "hvac.no_cool", status: "scheduled", scheduledAt: new Date(), ...job },
  });
  return { shop, tech, token, job: row };
}

test("the checklist fits the visit: category first, then the title, then the shop's trade", () => {
  assert.equal(checklistTemplateFor({ categoryCode: "hvac.no_cool" }, "HVAC").id, "hvac_cooling");
  assert.equal(checklistTemplateFor({ categoryCode: "hvac.no_heat" }, "HVAC").id, "hvac_heating");
  assert.equal(checklistTemplateFor({ categoryCode: "hvac.maintenance" }, "HVAC").id, "hvac_tune_up");
  assert.equal(checklistTemplateFor({ title: "Water heater leaking in garage" }, "Plumbing").id, "plumb_water_heater");
  assert.equal(checklistTemplateFor({ categoryCode: "elec.ev_charger" }, "Electrical").id, "elec_panel");
  assert.equal(checklistTemplateFor({ title: "Visit" }, "Electrical").id, "elec_general");
  assert.equal(checklistTemplateFor({ title: "Visit" }, null).id, "general");
  for (const t of Object.values(CHECKLIST_TEMPLATES)) {
    assert.equal(new Set(t.items.map((i) => i.id)).size, t.items.length, `${t.id} has unique item ids`);
  }
  const gas = CHECKLIST_TEMPLATES.hvac_heating.items.find((i) => i.id === "co");
  assert.equal(gas.reading, "ppm", "carbon monoxide is a reading, not just a tick");
});

test("ticks keep the time they first happened; strangers' ids are ignored", () => {
  const t = CHECKLIST_TEMPLATES.hvac_cooling;
  const now = new Date("2026-07-01T15:00:00Z");
  const earlier = "2026-07-01T14:20:00.000Z";
  const one = applyChecklist(null, t, [{ id: "filter", done: true, at: earlier }, { id: "made_up", done: true }, { id: "pressures", value: "  118 / 290  " }], now);
  assert.equal(one.checklist.done, 1);
  assert.equal(one.checklist.items.find((i) => i.id === "filter").at, earlier, "an offline tick keeps its own time");
  assert.equal(one.checklist.items.find((i) => i.id === "pressures").value, "118 / 290");
  assert.ok(!one.checklist.items.some((i) => i.id === "made_up"));
  const replay = applyChecklist(one.json, t, [{ id: "filter", done: true, at: "2026-07-01T14:50:00.000Z" }], now);
  assert.equal(replay.checklist.items.find((i) => i.id === "filter").at, earlier, "a replay doesn't move the tick");
  const future = applyChecklist(null, t, [{ id: "coil", done: true, at: "2027-01-01T00:00:00Z" }], now);
  assert.equal(future.checklist.items.find((i) => i.id === "coil").at, now.toISOString());
  const off = applyChecklist(one.json, t, [{ id: "filter", done: false }], now);
  assert.equal(off.checklist.items.find((i) => i.id === "filter").at, null);
  assert.equal(readChecklist("not json", t).total, t.items.length);
});

test("a saved checklist keeps its own copy and shows up for the office", async () => {
  const { shop, job } = await shopWithJob();
  const saved = await setJobChecklist(shop.id, job.id, [{ id: "capacitor", done: true, value: "42 µF" }]);
  assert.equal(saved.title, "Cooling call");
  await prisma.job.update({ where: { id: job.id }, data: { title: "Furnace out", categoryCode: "hvac.no_heat" } });
  const field = await jobField(shop.id, job.id);
  assert.equal(field.checklist.templateId, "hvac_cooling", "a started checklist doesn't switch under the tech");
  assert.equal(field.checklist.items.find((i) => i.id === "capacitor").value, "42 µF");
});

test("two ticks sent at the same moment both stick", async () => {
  const { shop, job } = await shopWithJob();
  await Promise.all(["filter", "capacitor", "contactor", "coil"].map((id) => setJobChecklist(shop.id, job.id, [{ id, done: true }])));
  const field = await jobField(shop.id, job.id);
  assert.equal(field.checklist.done, 4);
});

test("the customer signs for the total on screen; a resend lands once; signing again is explicit", async () => {
  const { shop, tech, job } = await shopWithJob();
  await setJobLines(shop.id, job.id, [{ name: "Capacitor", kind: "part", quantity: 1, unitCents: 18500 }]);
  await assert.rejects(saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: "Dana", image: "data:image/jpeg;base64,AAAA" }), /sign in the box/);
  await assert.rejects(saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: "  ", image: PNG }), /customer's name/);
  const first = await saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: " Dana  Cole ", image: PNG });
  assert.equal(first.created, true);
  assert.equal(first.signature.signerName, "Dana Cole");
  assert.equal(first.signature.agreedCents, 18500);
  assert.equal(first.signature.statement, "I approve the work listed and the total of $185.00.");
  const again = await saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: "Someone Else", image: PNG });
  assert.equal(again.created, false);
  assert.equal(again.signature.signerName, "Dana Cole");
  await setJobLines(shop.id, job.id, [{ name: "Capacitor", kind: "part", quantity: 1, unitCents: 18500 }, { name: "Labor", kind: "labor", quantity: 1, unitCents: 9000 }]);
  const resigned = await saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: "Dana Cole", image: PNG, replace: true });
  assert.equal(resigned.signature.agreedCents, 27500);
  assert.equal(await prisma.jobSignature.count({ where: { jobId: job.id } }), 1);
  const field = await jobField(shop.id, job.id);
  assert.equal(field.signature.signerName, "Dana Cole");
  assert.equal(signatureStatement(null), "I approve the work listed.");
  await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } });
  await assert.rejects(saveJobSignature({ businessId: shop.id, jobId: job.id, technicianId: tech.id, name: "Dana", image: PNG, replace: true }), /cancelled/);
});

test("a note resent after a dropped connection is saved once", async () => {
  const { shop, job } = await shopWithJob();
  const a = await addJobNote({ businessId: shop.id, jobId: job.id, body: "Replaced the capacitor", authorKind: "technician", authorName: "Ana Ruiz" });
  const b = await addJobNote({ businessId: shop.id, jobId: job.id, body: "Replaced the capacitor", authorKind: "technician", authorName: "Ana Ruiz" });
  assert.equal(a.id, b.id);
  await addJobNote({ businessId: shop.id, jobId: job.id, body: "Replaced the capacitor", authorKind: "person", authorName: "owner@shop.test" });
  assert.equal(await prisma.jobNote.count({ where: { jobId: job.id } }), 2, "office notes are never folded");
});

test("a status sent late from an offline phone keeps its field time and says so", async () => {
  const now = new Date();
  assert.deepEqual(fieldTime(undefined, now), { at: now, late: false });
  assert.equal(fieldTime(new Date(now.getTime() + 60_000).toISOString(), now).at, now, "a phone clock ahead of ours isn't trusted");
  assert.equal(fieldTime(new Date(now.getTime() - 2 * 86_400_000).toISOString(), now).at, now, "older than a day isn't trusted");
  assert.equal(fieldTime(new Date(now.getTime() - 5 * 60_000).toISOString(), now).late, false);
  assert.equal(fieldTime(new Date(now.getTime() - 40 * 60_000).toISOString(), now).late, true);

  const { shop, token, job } = await shopWithJob();
  const tech = await techForToken(token);
  const arrived = new Date(Date.now() - 45 * 60_000);
  await techUpdateJob(tech, job.id, { status: "on_site", happenedAt: arrived.toISOString() });
  const row = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true, onSiteAt: true } });
  assert.equal(row.status, "on_site");
  assert.equal(row.onSiteAt.toISOString(), arrived.toISOString());
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, jobId: job.id, action: "job.status" }, orderBy: { createdAt: "desc" } });
  assert.match(audit.summary, /sent when the phone got signal back/);
  const detail = await techJobDetail(tech, job.id);
  assert.ok(detail.checklist, "the tech app gets the checklist");
  assert.equal(detail.signature, null);

  const src = read("src/lib/tech-app.ts");
  assert.match(src, /if \(!late\) await customerText\(/, "no late 'arrived' text");
  assert.match(src, /notifyCustomer: !late/, "no late 'on the way' text");
});

test("the phone keeps working without signal and says what it's showing", () => {
  const offline = read("src/components/tech-app/offline.ts");
  assert.match(offline, /export async function cachedGet/);
  assert.match(offline, /export async function sendOrQueue/);
  assert.match(offline, /if \(outbox\(\)\.length\) \{\s*enqueue/, "queued changes keep their order");
  assert.match(offline, /res\.status === 429 \|\| res\.status >= 500\) break/, "a server hiccup retries instead of dropping");
  assert.match(read("src/components/tech-app/shared.tsx"), /Showing what was saved on this phone at/);
  const sw = read("public/tech-sw.js");
  assert.match(sw, /url\.pathname\.startsWith\("\/tech\/"\)/);
  assert.doesNotMatch(sw, /\/api\//, "job data is never served from the worker's cache");
  assert.match(read("src/components/tech-app/offline.ts"), /register\("\/tech-sw\.js", \{ scope: "\/tech\/" \}\)/);
  const route = read("src/lib/tech-route.ts");
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: error instanceof/, "server errors aren't shown raw to the tech");
});
