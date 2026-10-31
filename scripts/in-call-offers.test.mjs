#!/usr/bin/env node
/*
 * A hold is only for a time this call was offered by the server: an open time
 * the model picked on its own holds nothing, an offered time holds once, and
 * an offer that has expired or been replaced holds nothing.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { OWNER_SETS_TIMES_REPLY, UNOFFERED_SLOT_REPLY } = await import("../src/lib/in-call-tool-defs.ts");
const { findOpenSlots } = await import("../src/lib/job.ts");

const prisma = new PrismaClient();
const created = [];
after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function setup() {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const shop = await prisma.business.create({
    data: { name: "Offer Heating", slug: `offer-${stamp}`, environment: "test", trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]" },
  });
  created.push(shop.id);
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech", phone: "+15550003333", skillsJson: "[]" } });
  const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `offer_${stamp}`, status: "in-progress" } });
  const tools = { id: shop.id, name: shop.name, hoursJson: shop.hoursJson, timezone: shop.timezone, trade: shop.trade, servicesJson: shop.servicesJson };
  const ask = (name, args) => handleInCallToolCalls({
      shop: tools,
      callId: call.id,
      call: { id: call.id, callerPhone: "+15555550123" },
      toolCalls: [{ id: "t", name, args: name === "hold_appointment" ? { ...CALLER, ...args } : args }],
    }).then(([r]) => r.result);
  return { shop, call, ask };
}

const SERVICE = "Furnace blowing cold air";
const CALLER = { callerName: "Dana Reyes", address: "12 Elm St, Springfield" };

test("an open time that was never offered holds nothing", async () => {
  const { shop, call, ask } = await setup();
  const [open] = await findOpenSlots(
    { businessId: shop.id, urgency: null, durationMin: 90, skill: "general", hoursJson: shop.hoursJson, timezone: shop.timezone },
    { count: 1 },
  );
  assert.ok(open);
  assert.equal(await ask("hold_appointment", { slot: open.toISOString(), serviceType: SERVICE }), UNOFFERED_SLOT_REPLY);
  assert.equal((await prisma.call.findUnique({ where: { id: call.id } })).heldSlotAt, null);

  const offer = await ask("check_availability", { serviceType: SERVICE });
  const offered = [...offer.matchAll(/\[slot ([^\]]+)\]/g)].map((m) => m[1]);
  assert.ok(offered.length >= 2, offer);
  const later = new Date(new Date(offered[0]).getTime() + 30 * 60_000).toISOString();
  assert.ok(!offered.includes(later));
  assert.equal(await ask("hold_appointment", { slot: later, serviceType: SERVICE }), UNOFFERED_SLOT_REPLY, "open, but not offered");
  assert.equal(await ask("hold_new_time", { slot: later }), UNOFFERED_SLOT_REPLY, "a move needs an offered time too");
});

test("an offered time holds once; an expired or replaced offer holds nothing", async () => {
  const { call, ask } = await setup();
  const offer = await ask("check_availability", { serviceType: SERVICE });
  const [first, second] = [...offer.matchAll(/\[slot ([^\]]+)\]/g)].map((m) => m[1]);
  assert.match(await ask("hold_appointment", { slot: first, serviceType: SERVICE }), /^Held /);
  assert.match(await ask("hold_appointment", { slot: first, serviceType: SERVICE }), /^Held /, "repeating the same hold on the same call keeps it");
  assert.equal(await prisma.call.count({ where: { id: call.id, heldSlotAt: new Date(first) } }), 1);

  const row = await prisma.call.findUnique({ where: { id: call.id } });
  const stale = { ...JSON.parse(row.slotOfferJson), expiresAt: new Date(Date.now() - 1000).toISOString() };
  await prisma.call.update({ where: { id: call.id }, data: { slotOfferJson: JSON.stringify(stale) } });
  assert.equal(await ask("hold_appointment", { slot: second, serviceType: SERVICE }), UNOFFERED_SLOT_REPLY, "expired");

  await ask("check_availability", { serviceType: SERVICE, preference: "next week friday afternoon" });
  const latest = JSON.parse((await prisma.call.findUnique({ where: { id: call.id } })).slotOfferJson).slots;
  const dropped = [first, second].find((s) => !latest.includes(s));
  if (dropped) assert.equal(await ask("hold_appointment", { slot: dropped, serviceType: SERVICE }), UNOFFERED_SLOT_REPLY, "replaced by a newer offer");
});

test("no time is held, and no 'You're booked' said, before the name, address and a reachable number", async () => {
  const { call, shop } = await setup();
  const tools = { id: shop.id, name: shop.name, hoursJson: shop.hoursJson, timezone: shop.timezone, trade: shop.trade, servicesJson: shop.servicesJson };
  const run = (name, args, callerPhone, callerWords) =>
    handleInCallToolCalls({ shop: tools, callId: call.id, call: { id: call.id, callerPhone }, callerWords, toolCalls: [{ id: "t", name, args }] }).then(
      ([r]) => r.result,
    );
  const offer = await run("check_availability", { serviceType: SERVICE }, "+15555550123");
  const [slot] = [...offer.matchAll(/\[slot ([^\]]+)\]/g)].map((m) => m[1]);

  const bare = await run("hold_appointment", { slot, serviceType: SERVICE }, "+15555550123");
  assert.match(bare, /^Not held yet\. .*their name and service address/);
  assert.doesNotMatch(bare, /You're booked/);
  assert.match(await run("hold_appointment", { slot, serviceType: SERVICE, callerName: "Dana", address: "Springfield" }, "+15555550123"), /service address/, "a town is not a street address");
  assert.equal((await prisma.call.findUnique({ where: { id: call.id } })).heldSlotAt, null);

  const withheld = await run("hold_appointment", { slot, serviceType: SERVICE, ...CALLER }, null);
  assert.match(withheld, /callback number/, "a withheld caller ID needs a number the caller said");
  const guessed = await run("hold_appointment", { slot, serviceType: SERVICE, ...CALLER, callbackNumber: "555-555-0199" }, null, "User: my furnace is blowing cold air");
  assert.match(guessed, /callback number/, "a number the caller never said is not a callback");
  const said = await run(
    "hold_appointment",
    { slot, serviceType: SERVICE, ...CALLER, callbackNumber: "555-555-0199" },
    null,
    "User: my furnace is blowing cold air\nUser: call me back at 555 555 0199",
  );
  assert.match(said, /^Held .*You're booked for/);
});

test("a shop whose plan has ended is never offered a time the booker would refuse", async () => {
  const { call, shop } = await setup();
  const lapsed = {
    id: shop.id,
    name: shop.name,
    hoursJson: shop.hoursJson,
    timezone: shop.timezone,
    trade: shop.trade,
    servicesJson: shop.servicesJson,
    environment: "production",
    billingStatus: "canceled",
  };
  const [reply] = await handleInCallToolCalls({
    shop: lapsed,
    callId: call.id,
    toolCalls: [{ id: "c", name: "check_availability", args: { serviceType: SERVICE } }],
  });
  assert.equal(reply.result, OWNER_SETS_TIMES_REPLY);
});
