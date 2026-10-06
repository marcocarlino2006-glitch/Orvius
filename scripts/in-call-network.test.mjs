#!/usr/bin/env node
/*
 * Booked solid, but the caller still gets help: when no time is open and a
 * nearby Orvius Network shop is, the receptionist offers to pass the caller
 * along, records their yes on the call, and the job goes straight to the
 * nearby shops after the call.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { buildInCallTools, NETWORK_OFFER_REPLY, NO_SLOTS_REPLY, PASSED_TO_NETWORK_REPLY, NETWORK_UNAVAILABLE_REPLY, NETWORK_NOT_A_YES_REPLY } = await import(
  "../src/lib/in-call-tool-defs.ts"
);
const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");
const { passConsentedCallLead } = await import("../src/lib/orvius-network.ts");
const { answerVoiceSimToolCalls } = await import("../src/lib/voice-sim-tools.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const ZIP3 = String(800 + Math.floor(Math.random() * 99));
const CLOSED = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { closed: true }])),
);
const created = [];

after(async () => {
  await prisma.business.updateMany({ where: { id: { in: created } }, data: { networkOn: false } });
  await prisma.ownerNotification.deleteMany({ where: { businessId: { in: created } } });
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function shop(overrides = {}) {
  const id = stamp();
  const row = await prisma.business.create({
    data: {
      name: `Booked ${id}`,
      slug: `icn-${id}`,
      trade: "Plumbing",
      address: `9 Lake St, Denver, CO ${ZIP3}05`,
      hoursJson: CLOSED,
      ownerPhone: randomPhone(),
      networkOn: true,
      networkZip3: ZIP3,
      stripeSubscriptionId: `sub_${id}`,
      billingStatus: "active",
      ...overrides,
    },
  });
  created.push(row.id);
  return row;
}

const toolsShop = (s) => ({
  id: s.id,
  name: s.name,
  hoursJson: s.hoursJson,
  timezone: s.timezone,
  trade: s.trade,
  servicesJson: s.servicesJson,
  ownerPhone: s.ownerPhone,
  networkOn: s.networkOn,
  networkZip3: s.networkZip3,
  address: s.address,
});

const ask = (s, callId, name, args = {}) =>
  handleInCallToolCalls({ shop: toolsShop(s), callId, toolCalls: [{ id: "t1", name, args }] }).then(([r]) => r.result);

test("the receptionist has the tool, and the sim answers it with the production words", () => {
  assert.ok(buildInCallTools({ webhookUrl: "https://x" }).some((t) => t.function.name === "pass_to_network"));
  const [r] = answerVoiceSimToolCalls([{ id: "p", name: "pass_to_network", args: { callerSaid: "Yes please" } }]);
  assert.equal(r.result, PASSED_TO_NETWORK_REPLY);
  const [none] = answerVoiceSimToolCalls([{ id: "p", name: "pass_to_network", args: {} }]);
  assert.equal(none.result, NETWORK_NOT_A_YES_REPLY, "no words, no yes");
});

test("booked solid: offer a nearby pro only when one is on the network", async () => {
  const booked = await shop();
  const call = await prisma.call.create({ data: { businessId: booked.id, vapiCallId: `icn-${stamp()}`, status: "in-progress" } });

  assert.equal(await ask(booked, call.id, "check_availability", { serviceType: "leaky faucet", urgency: "flexible" }), NO_SLOTS_REPLY, "no partner yet");
  assert.equal(await ask(booked, call.id, "pass_to_network", { callerSaid: "yes" }), NETWORK_UNAVAILABLE_REPLY);
  assert.equal((await prisma.call.findUnique({ where: { id: call.id } })).networkConsentAt, null);

  await shop({ hoursJson: "{}" });
  assert.equal(await ask(booked, call.id, "check_availability", { serviceType: "leaky faucet", urgency: "flexible" }), NETWORK_OFFER_REPLY);
  assert.match(NETWORK_OFFER_REPLY, /Ask once/);
  assert.match(NETWORK_OFFER_REPLY, /share your name, number and what you need with another local company/);
  assert.equal(await ask(booked, call.id, "pass_to_network"), NETWORK_NOT_A_YES_REPLY);
  assert.equal(await ask(booked, call.id, "pass_to_network", { callerSaid: "No thanks, I'll wait" }), NETWORK_NOT_A_YES_REPLY);
  assert.equal((await prisma.call.findUnique({ where: { id: call.id } })).networkConsentAt, null, "a no is never recorded as a yes");
  assert.equal(await ask(booked, call.id, "pass_to_network", { callerSaid: "Yeah, go ahead" }), PASSED_TO_NETWORK_REPLY);
  assert.ok((await prisma.call.findUnique({ where: { id: call.id } })).networkConsentAt, "the caller's yes is on the call");

  const off = await shop({ networkOn: false });
  const offCall = await prisma.call.create({ data: { businessId: off.id, vapiCallId: `icn-${stamp()}`, status: "in-progress" } });
  assert.equal(await ask(off, offCall.id, "check_availability", { serviceType: "leaky faucet", urgency: "flexible" }), NO_SLOTS_REPLY);
});

test("after the call, a consented lead goes straight to nearby shops, once", async () => {
  const sender = await shop();
  const partner = await shop({ hoursJson: "{}" });
  const lead = await prisma.lead.create({
    data: { businessId: sender.id, name: "Rosa Diaz", phone: randomPhone(), serviceType: "Burst pipe", urgency: "same-day", address: `5 Elm, Denver CO ${ZIP3}10` },
  });
  const owner = [];
  const texts = { toCustomer: async () => ({ sent: true }), toOwner: async (m) => (owner.push(m), { sid: "SM1" }) };
  const ref = { id: sender.id, name: sender.name, trade: sender.trade, address: sender.address, networkOn: true };

  const result = await passConsentedCallLead(ref, { ...lead, job: null }, new Date(), texts);
  assert.ok("offered" in result && result.offered >= 1);
  assert.ok(owner.some((m) => m.businessId === partner.id && /Reply TAKE/.test(m.body) && /for Rosa/.test(m.body)));
  assert.ok(owner.every((m) => !m.body.includes(lead.phone)), "the caller's number is never in the offer");
  const handoff = await prisma.networkHandoff.findUnique({ where: { leadId: lead.id } });
  assert.equal(handoff.status, "offered");

  assert.deepEqual(await passConsentedCallLead(ref, { ...lead, job: null }, new Date(), texts), { skipped: "already" });
  assert.deepEqual(await passConsentedCallLead({ ...ref, networkOn: false }, { ...lead, job: null }, new Date(), texts), { skipped: "network_off" });
});
