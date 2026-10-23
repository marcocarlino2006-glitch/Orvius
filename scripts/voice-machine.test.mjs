import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

process.env.ORVIUS_MACHINE_KEY = "voice-machine-test-key";
process.env.VAPI_WEBHOOK_SECRET = "shared-webhook-secret";

const machine = await import("../src/lib/voice-machine.ts");
const { buildBusinessAssistantConfig } = await import("../src/lib/sync-business-assistant.ts");
const { prisma } = await import("../src/lib/prisma.ts");

test("a shop's seal opens only that shop's machine", () => {
  const a = machine.machineSeal("machine-a");
  const b = machine.machineSeal("machine-b");
  assert.ok(a && b);
  assert.notEqual(a, b);
  assert.equal(a, createHmac("sha256", "voice-machine-test-key").update("voice-machine:machine-a").digest("hex"));
  assert.notEqual(a, createHmac("sha256", "shared-webhook-secret").update("voice-machine:machine-a").digest("hex"));
});

test("a call enters a shop only when every identifier is that shop's", () => {
  const shop = { id: "shop-a", vapiAssistantId: "asst-a", twilioPhone: "+15125550100", vapiPhoneNumber: "+15125550100" };
  assert.equal(machine.callBelongsToShop(shop, { assistantId: "asst-a", inboundNumber: "+15125550100" }), true);
  assert.equal(machine.callBelongsToShop(shop, { assistantId: "asst-b", inboundNumber: "+15125550100" }), false);
  assert.equal(machine.callBelongsToShop(shop, { assistantId: "asst-a", inboundNumber: "+15125550999" }), false);
  assert.equal(machine.callBelongsToShop(shop, { existingBusinessId: "shop-b", assistantId: "asst-a" }), false);
  assert.equal(machine.callBelongsToShop(shop, {}), false);
  assert.equal(machine.callBelongsToShop(shop, { existingBusinessId: "shop-a", assistantId: "asst-b" }), false);
});

test("a live shop's receptionist is pointed at its own machine, and the demo stays shared", () => {
  const live = buildBusinessAssistantConfig({
    name: "Ridge Heating",
    slug: "ridge-heating",
    environment: "production",
    voiceMachineId: "abc123",
    greeting: "Thanks for calling Ridge Heating.",
    hoursJson: "{}",
    servicesJson: "[]",
    trade: "HVAC",
    bookingMode: "book",
    receptionistRulesJson: "[]",
    closedDatesJson: "[]",
    timezone: "America/Chicago",
    voiceId: null,
    transferPhone: null,
  });
  assert.match(live.serverUrl, /\/api\/webhooks\/vapi\/machines\/abc123$/);
  assert.equal(live.serverUrlSecret, machine.machineSeal("abc123"));
  assert.notEqual(live.serverUrlSecret, process.env.VAPI_WEBHOOK_SECRET);

  const demo = buildBusinessAssistantConfig({
    name: "Summit HVAC",
    slug: "summit-hvac",
    environment: "demo",
    voiceMachineId: null,
    greeting: "Thanks for calling Summit HVAC.",
    hoursJson: "{}",
    servicesJson: "[]",
    trade: "HVAC",
    bookingMode: "book",
    receptionistRulesJson: "[]",
    closedDatesJson: "[]",
    timezone: "America/Chicago",
    voiceId: null,
    transferPhone: null,
  });
  assert.match(demo.serverUrl, /\/api\/webhooks\/vapi$/);
  assert.doesNotMatch(demo.serverUrl, /machines/);
});

test("each live shop gets one voice machine, and another shop's seal cannot open it", async () => {
  const stamp = Date.now().toString(36);
  const a = await prisma.business.create({
    data: { name: `Machine A ${stamp}`, slug: `machine-a-${stamp}`, environment: "production", ownerEmail: `machine-a-${stamp}@example.test` },
  });
  const b = await prisma.business.create({
    data: { name: `Machine B ${stamp}`, slug: `machine-b-${stamp}`, environment: "production", ownerEmail: `machine-b-${stamp}@example.test` },
  });
  try {
    assert.equal(machine.shopGetsOwnVoiceMachine(a), true);
    assert.equal(machine.shopGetsOwnVoiceMachine({ ...a, environment: "test" }), false);
    assert.equal(machine.shopGetsOwnVoiceMachine({ ...a, environment: "demo", slug: "summit-hvac", name: "Summit HVAC" }), false);
    const first = await machine.ensureVoiceMachine(a.id);
    const again = await machine.ensureVoiceMachine(a.id);
    assert.equal(again, first);
    const other = await machine.ensureVoiceMachine(b.id);
    assert.notEqual(other, first);
    assert.deepEqual(await machine.openVoiceMachine(first, machine.machineSeal(first)), { machineId: first, businessId: a.id });
    assert.equal(await machine.openVoiceMachine(first, machine.machineSeal(other)), null);
    assert.equal(await machine.openVoiceMachine(first, process.env.VAPI_WEBHOOK_SECRET), null);
    assert.equal(await machine.openVoiceMachine(other, machine.machineSeal(first)), null);
  } finally {
    await prisma.business.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
});
