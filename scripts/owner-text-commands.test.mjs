#!/usr/bin/env node
/*
 * Run the shop by text: an owner's reply to a lead alert books, moves,
 * assigns, texts, or closes that lead, and the answer names the customer.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { parseOwnerCommand, parseShopTime, handleOwnerText, OWNER_MENU } = await import("../src/lib/owner-text-commands.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 8e6)}`;
const TZ = "America/Chicago";
/* Thursday Oct 1 2026, 10:00 AM in Chicago. */
const NOW = new Date("2026-10-01T15:00:00Z");
const chicago = (at) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);

test("owner replies parse into commands; anything else is not one", () => {
  assert.deepEqual(parseOwnerCommand("Book it"), { kind: "book", when: null });
  assert.deepEqual(parseOwnerCommand("yes"), { kind: "book", when: null });
  assert.deepEqual(parseOwnerCommand("BOOK FRI 2PM"), { kind: "book", when: "fri 2pm" });
  assert.deepEqual(parseOwnerCommand("move to thursday 9am"), { kind: "move", when: "thursday 9am" });
  assert.deepEqual(parseOwnerCommand("Text: On my way, 20 min"), { kind: "text", body: "On my way, 20 min" });
  assert.deepEqual(parseOwnerCommand("tech ana"), { kind: "assign", tech: "ana" });
  assert.deepEqual(parseOwnerCommand("called"), { kind: "contacted" });
  assert.deepEqual(parseOwnerCommand("Wrong number"), { kind: "spam" });
  assert.deepEqual(parseOwnerCommand("today"), { kind: "today" });
  assert.deepEqual(parseOwnerCommand("?"), { kind: "menu" });
  assert.equal(parseOwnerCommand("hey is the furnace guy coming"), null);
  assert.equal(parseOwnerCommand(""), null);
});

test("times read in the shop's zone the way an owner types them", () => {
  assert.equal(chicago(parseShopTime("fri 2pm", TZ, NOW)), "Fri, 10/2, 2:00 PM");
  assert.equal(chicago(parseShopTime("tomorrow 9", TZ, NOW)), "Fri, 10/2, 9:00 AM");
  assert.equal(chicago(parseShopTime("3", TZ, NOW)), "Thu, 10/1, 3:00 PM", "a bare 3 is the afternoon");
  assert.equal(chicago(parseShopTime("10/3 2:30pm", TZ, NOW)), "Sat, 10/3, 2:30 PM");
  assert.equal(chicago(parseShopTime("oct 5 at 1pm", TZ, NOW)), "Mon, 10/5, 1:00 PM");
  assert.equal(chicago(parseShopTime("8am", TZ, NOW)), "Fri, 10/2, 8:00 AM", "a time already passed today means tomorrow");
  assert.equal(chicago(parseShopTime("thu 9am", TZ, NOW)), "Thu, 10/8, 9:00 AM", "this morning has passed, so next Thursday");
  assert.equal(chicago(parseShopTime("monday", TZ, NOW)), "Mon, 10/5, 9:00 AM");
  assert.equal(chicago(parseShopTime("noon tomorrow", TZ, NOW)), "Fri, 10/2, 12:00 PM");
  assert.equal(parseShopTime("whenever works", TZ, NOW), null);
  assert.equal(parseShopTime("13/40", TZ, NOW), null);
});

async function fixture() {
  const business = await prisma.business.create({
    data: {
      name: "Summit HVAC",
      slug: `otc-${stamp()}`,
      trade: "HVAC",
      timezone: TZ,
      hoursJson: "{}",
      ownerPhone: randomPhone(),
    },
  });
  const ana = await prisma.technician.create({ data: { businessId: business.id, name: "Ana Ruiz", isActive: true } });
  await prisma.technician.create({ data: { businessId: business.id, name: "Ben Okafor", isActive: true } });
  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      name: "Maria Lopez",
      phone: randomPhone(),
      serviceType: "AC not cooling",
      address: "418 Elm St, Evanston IL 60201",
      status: "new",
      source: "call",
    },
  });
  await prisma.ownerNotification.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      channel: "sms",
      dedupeKey: `lead:${lead.id}`,
      status: "sent",
      businessName: business.name,
      message: "New lead",
      createdAt: new Date(NOW.getTime() - 5 * 60_000),
    },
  });
  return { business, lead, ana, shop: { id: business.id, name: business.name, timezone: TZ, ownerPhone: business.ownerPhone } };
}

test("BOOK, TECH and MOVE run the latest lead from the owner's thread", async () => {
  const { business, lead, shop } = await fixture();
  try {
    const booked = await handleOwnerText({ shop, body: "book fri 2pm", now: NOW });
    assert.match(booked, /^Booked Maria Lopez · Fri, Oct 2, 2:00 PM/);
    const job = await prisma.job.findUnique({ where: { leadId: lead.id } });
    assert.ok(job, "the reply put a job on the board");
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "booked");

    assert.match(await handleOwnerText({ shop, body: "book", now: NOW }), /already booked/);

    assert.match(booked, /with Ana\.$/, "booking assigns the free tech and says who");
    const assigned = await handleOwnerText({ shop, body: "tech ben", now: NOW });
    assert.match(assigned, /^Ben Okafor is on Maria Lopez's job/);
    const ben = await prisma.technician.findFirst({ where: { businessId: business.id, name: "Ben Okafor" } });
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).technicianId, ben.id);
    assert.match(await handleOwnerText({ shop, body: "tech ben", now: NOW }), /already on/);
    assert.match(await handleOwnerText({ shop, body: "tech zed", now: NOW }), /No tech named "zed"\. Your crew: Ana, Ben/);

    const moved = await handleOwnerText({ shop, body: "move to monday 8am", now: NOW });
    assert.equal(moved, "Moved Maria Lopez to Mon, Oct 5, 8:00 AM. Reply TEXT <message> to tell them.");
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "job.rescheduled" } });
    assert.equal(audit.actor, "owner");

    assert.match(await handleOwnerText({ shop, body: "move whenever", now: NOW }), /Couldn't read "whenever"/);
    assert.match(await handleOwnerText({ shop, body: "spam", now: NOW }), /already has a job/);
  } finally {
    await prisma.business.delete({ where: { id: business.id } });
  }
});

test("CALLED, SPAM, TEXT and the menu answer without touching other leads", async () => {
  const { business, lead, shop } = await fixture();
  try {
    assert.equal(await handleOwnerText({ shop, body: "?", now: NOW }), OWNER_MENU);
    assert.equal(await handleOwnerText({ shop, body: "the furnace guy is late", now: NOW }), null);

    assert.match(await handleOwnerText({ shop, body: "called", now: NOW }), /^Marked Maria Lopez handled/);
    const handled = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.equal(handled.status, "contacted");
    assert.ok(handled.firstContactedAt);

    assert.match(await handleOwnerText({ shop, body: "text On my way", now: NOW }), /didn't send\. Call Maria Lopez/, "no SMS provider in tests");

    assert.match(await handleOwnerText({ shop, body: "spam", now: NOW }), /^Marked Maria Lopez not a job/);
    assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "spam");
  } finally {
    await prisma.business.delete({ where: { id: business.id } });
  }
});

test("with no recent alert there is nothing to act on, and TODAY lists the board", async () => {
  const business = await prisma.business.create({
    data: { name: "Quiet Shop", slug: `otc-${stamp()}`, trade: "HVAC", timezone: TZ, hoursJson: "{}", ownerPhone: randomPhone() },
  });
  const shop = { id: business.id, name: business.name, timezone: TZ, ownerPhone: business.ownerPhone };
  try {
    assert.match(await handleOwnerText({ shop, body: "book", now: NOW }), /^No recent lead to act on/);
    assert.equal(await handleOwnerText({ shop, body: "today", now: NOW }), "Nothing on the board today.");
    await prisma.job.create({
      data: { businessId: business.id, title: "Tune-up", status: "scheduled", scheduledAt: new Date("2026-10-01T19:00:00Z") },
    });
    assert.equal(await handleOwnerText({ shop, body: "today", now: NOW }), "Today · 1 job\n2:00 PM Customer · Tune-up (no tech)");
  } finally {
    await prisma.business.delete({ where: { id: business.id } });
  }
});
