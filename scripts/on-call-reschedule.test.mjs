#!/usr/bin/env node
/*
 * A customer moving a visit on the call: the new time is held so nobody else
 * takes it, the owner is told exactly what to move, and no second job is ever
 * booked, whatever words the caller used.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { maybeAutoBookLead } from "../src/lib/auto-job.ts";
import { buildCallerContextNote } from "../src/lib/caller-context.ts";
import { handleInCallToolCalls } from "../src/lib/in-call-tools.ts";
import { ownerAlertContextLine } from "../src/lib/owner-alert-message.ts";
import { answerVoiceSimToolCalls } from "../src/lib/voice-sim-tools.ts";
import { buildAssistantSystemPrompt } from "../src/lib/business.ts";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function shopWithBookedCustomer() {
  const shop = await prisma.business.create({
    data: { name: "Move Air", slug: `move-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  await prisma.technician.create({ data: { businessId: shop.id, name: "Only Tech", phone: `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`, skillsJson: "[]" } });
  const phone = `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Ann Cole", phone, phoneNormalized: phone } });
  const booked = await prisma.job.create({
    data: {
      businessId: shop.id,
      customerId: customer.id,
      title: "Furnace tune-up",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMin: 60,
      // Booked two weeks ago: older than auto-book's 7-day repeat guard, like most maintenance visits.
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    },
  });
  return { shop, customer, booked };
}

async function callAboutIt(shop, customer, toolName) {
  const transcript = "AI: Thanks for calling Move Air.\nUser: Hi, it's Ann. Can you come Friday instead?\nAI: Let me check the schedule.";
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `move_${stamp()}`, status: "in-progress", transcript } });
  const lead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      callId: call.id,
      customerId: customer.id,
      name: "Ann Cole",
      phone: customer.phone,
      serviceType: "Furnace tune-up, come Friday",
      address: "1122 Elinor Place, Evanston IL 60201",
      status: "new",
    },
  });
  const tools = { id: shop.id, name: shop.name, hoursJson: shop.hoursJson, timezone: shop.timezone, trade: shop.trade, servicesJson: shop.servicesJson };
  const [offer] = await handleInCallToolCalls({
    shop: tools,
    callId: call.id,
    toolCalls: [{ id: "c", name: "check_availability", args: { serviceType: "Furnace tune-up", preference: "Friday" } }],
  });
  const slot = offer.result.match(/\[slot ([^\]]+)\]/)?.[1];
  assert.ok(slot, offer.result);
  const [held] = await handleInCallToolCalls({
    shop: tools,
    callId: call.id,
    toolCalls: [{ id: "h", name: toolName, args: { slot, serviceType: "Furnace tune-up" } }],
  });
  return { call, lead, slot: new Date(slot), reply: held.result };
}

test("a new time for an existing visit is held and never becomes a second job", async () => {
  const { shop, customer, booked } = await shopWithBookedCustomer();
  try {
    const { call, lead, slot, reply } = await callAboutIt(shop, customer, "hold_new_time");
    assert.match(reply, /^Held .* as the new time for their existing visit/);
    assert.match(reply, /Never say the visit is moved or confirmed/);
    assert.doesNotMatch(reply, /penciled in/);
    const stored = await prisma.call.findUnique({ where: { id: call.id } });
    assert.equal(stored.heldIntent, "reschedule");
    assert.equal(stored.heldSlotAt.getTime(), slot.getTime());

    const result = await maybeAutoBookLead(lead.id);
    assert.equal(result.created, false, JSON.stringify(result));
    assert.equal(result.intent, "reschedule");
    assert.equal(result.skipReason, "existing_job");
    assert.equal(result.existingJob.id, booked.id);
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1, "still exactly one job");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("without the reschedule hold, the same words book a duplicate (why hold_new_time exists)", async () => {
  const { shop, customer } = await shopWithBookedCustomer();
  try {
    const { lead } = await callAboutIt(shop, customer, "hold_appointment");
    const result = await maybeAutoBookLead(lead.id);
    assert.equal(result.created, true);
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 2);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("a complaint still wins over a reschedule hold", async () => {
  const { shop, customer } = await shopWithBookedCustomer();
  try {
    const { call, lead } = await callAboutIt(shop, customer, "hold_new_time");
    await prisma.call.update({ where: { id: call.id }, data: { transcript: "User: You came out last week and it's still not working. Can you come Friday?" } });
    const result = await maybeAutoBookLead(lead.id);
    assert.equal(result.skipReason, "complaint");
    assert.equal(result.created, false);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("the owner is told the exact new time to move the visit to, once", () => {
  const heldSlotAt = new Date("2026-10-02T15:00:00.000Z");
  const line = ownerAlertContextLine({
    skipReason: "existing_job",
    intent: "reschedule",
    existingJob: { title: "Furnace tune-up", scheduledAt: new Date("2026-10-01T14:00:00.000Z") },
    heldSlotAt,
    timezone: "America/Chicago",
  });
  assert.match(line, /Wants to move the Furnace tune-up on .* to .*Fri.*held for them/);
  assert.match(line, /Not moved yet/);
  assert.doesNotMatch(line, /call to pick a time/);
  assert.doesNotMatch(line, /Caller was offered and took/);
});

test("the sim sandbox answers hold_new_time with the production words", () => {
  const monday = new Date("2026-09-28T13:00:00.000Z");
  const [offer] = answerVoiceSimToolCalls([{ id: "c", name: "check_availability", args: { serviceType: "tune-up" } }], { now: monday });
  const slot = offer.result.match(/\[slot ([^\]]+)\]/)[1];
  const [held] = answerVoiceSimToolCalls([{ id: "h", name: "hold_new_time", args: { slot } }], { now: monday });
  assert.match(held.result, /as the new time for their existing visit/);
});

test("the receptionist knows how to move a visit, and says the tech's status once the caller is confirmed", () => {
  const prompt = buildAssistantSystemPrompt({ name: "Move Air", greeting: null, hoursJson: "{}", servicesJson: "[]", canBook: true });
  assert.match(prompt, /call hold_new_time, never hold_appointment/);
  assert.match(prompt, /Never say a visit is moved or cancelled/);
  const legacy = buildAssistantSystemPrompt({ name: "Move Air", greeting: null, hoursJson: "{}", servicesJson: "[]" });
  assert.doesNotMatch(legacy, /hold_new_time/);
  assert.match(legacy, /Never say a visit is moved or cancelled/);

  const note = buildCallerContextNote({
    name: "Ann Cole",
    interactionCount: 3,
    timezone: "America/Chicago",
    lastJob: null,
    openJob: { title: "No heat", scheduledAt: new Date("2026-09-29T15:00:00.000Z"), status: "en_route", address: "1 Elm", etaText: "25 min" },
  });
  assert.match(note, /the technician is on the way, arriving in about 25 min/);
  assert.match(note, /Once they confirm who they are, you may tell them this time and status/);
});

test.after(() => prisma.$disconnect());
