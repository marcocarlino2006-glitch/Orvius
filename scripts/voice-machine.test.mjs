import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.ORVIUS_MACHINE_KEY = "voice-machine-test-key";
process.env.VAPI_WEBHOOK_SECRET = "shared-webhook-secret";

const machine = await import("../src/lib/voice-machine.ts");
const { buildBusinessAssistantConfig } = await import("../src/lib/sync-business-assistant.ts");
const { prisma } = await import("../src/lib/prisma.ts");

test("the production column statements are the reviewed ones", async () => {
  const { VOICE_MACHINE_PLAN_SHA256, voiceMachinePlanSha256 } = await import("./apply-voice-machine-column.mjs");
  assert.equal(voiceMachinePlanSha256(), VOICE_MACHINE_PLAN_SHA256);
});

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

  const summit = buildBusinessAssistantConfig({
    name: "Summit HVAC",
    slug: "summit-hvac",
    environment: "production",
    voiceMachineId: "should-not-route",
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
  assert.match(summit.serverUrl, /\/api\/webhooks\/vapi$/);
  assert.doesNotMatch(summit.serverUrl, /machines/);
  assert.equal(machine.callReachesThisDeployment(live.serverUrl), true);
  assert.equal(machine.callReachesThisDeployment(demo.serverUrl), true);
  assert.equal(machine.callReachesThisDeployment("https://evil.example/api/webhooks/vapi/machines/abc123"), false);
  assert.match(readFileSync(new URL("./vapi-doctor.mjs", import.meta.url), "utf8"), /deliversToOrvius/);
});

test("each live shop gets one voice machine, and another shop's seal cannot open it", async () => {
  const stamp = Date.now().toString(36);
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("Business")');
  if (!columns.some((column) => column.name === "voiceMachineId")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Business" ADD COLUMN "voiceMachineId" TEXT');
  }
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Business_voiceMachineId_key" ON "Business"("voiceMachineId")');
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

async function withMachineColumn() {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("Business")');
  if (!columns.some((column) => column.name === "voiceMachineId")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Business" ADD COLUMN "voiceMachineId" TEXT');
  }
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Business_voiceMachineId_key" ON "Business"("voiceMachineId")');
}

test("a live shop with no stored machine id opens on its own id, and the demo does not", async () => {
  await withMachineColumn();
  const stamp = Date.now().toString(36);
  const live = await prisma.business.create({
    data: { name: `Door Live ${stamp}`, slug: `door-live-${stamp}`, environment: "production", ownerEmail: `door-live-${stamp}@example.test` },
  });
  const demo = await prisma.business.create({
    data: { name: "Summit HVAC", slug: `summit-hvac-${stamp}`, environment: "production", ownerEmail: `summit-${stamp}@example.test` },
  });
  const quiet = await prisma.business.create({
    data: { name: `Door Quiet ${stamp}`, slug: `door-quiet-${stamp}`, environment: "production", isActive: false, ownerEmail: `door-quiet-${stamp}@example.test` },
  });
  try {
    assert.deepEqual(await machine.openVoiceMachine(live.id, machine.machineSeal(live.id)), { machineId: live.id, businessId: live.id });
    assert.equal(await machine.openVoiceMachine(live.id, machine.machineSeal(demo.id)), null);
    assert.equal(await machine.openVoiceMachine(demo.id, machine.machineSeal(demo.id)), null);
    assert.equal(await machine.openVoiceMachine(quiet.id, machine.machineSeal(quiet.id)), null);
    const stored = await machine.ensureVoiceMachine(live.id);
    assert.notEqual(stored, live.id);
    assert.match(await machine.shopReceptionistUrl(live), new RegExp(`/api/webhooks/vapi/machines/${stored}$`));
    assert.match(await machine.shopReceptionistUrl(demo), /\/api\/webhooks\/vapi$/);
    assert.doesNotMatch(await machine.shopReceptionistUrl(demo), /machines/);
    assert.equal(await machine.openVoiceMachine(live.id, machine.machineSeal(live.id)), null);
    assert.deepEqual(await machine.openVoiceMachine(stored, machine.machineSeal(stored)), { machineId: stored, businessId: live.id });
  } finally {
    await prisma.business.deleteMany({ where: { id: { in: [live.id, demo.id, quiet.id] } } });
  }
});

test("a missing machine column is not one shared door named voiceMachineId", async () => {
  const stamp = Date.now().toString(36);
  const live = await prisma.business.create({
    data: { name: `Literal Live ${stamp}`, slug: `literal-live-${stamp}`, environment: "production", ownerEmail: `literal-live-${stamp}@example.test` },
  });
  const demo = await prisma.business.create({
    data: { name: `Literal Demo ${stamp}`, slug: `literal-demo-${stamp}`, environment: "demo", ownerEmail: `literal-demo-${stamp}@example.test` },
  });
  const queryRaw = prisma.$queryRaw;
  const executeRaw = prisma.$executeRaw;
  prisma.$queryRaw = async () => [{ voiceMachineId: "voiceMachineId", id: live.id, isActive: 1 }];
  prisma.$executeRaw = () => {
    throw new Error("no such column: voiceMachineId");
  };
  try {
    assert.equal(await machine.ensureVoiceMachine(live.id), live.id);
    assert.equal(await machine.businessIdForVoiceMachine(live.id), live.id);
    assert.equal(await machine.businessIdForVoiceMachine("voiceMachineId"), null);
    assert.deepEqual(await machine.openVoiceMachine(live.id, machine.machineSeal(live.id)), { machineId: live.id, businessId: live.id });
    assert.equal(await machine.openVoiceMachine("voiceMachineId", machine.machineSeal("voiceMachineId")), null);
    assert.equal(await machine.openVoiceMachine(demo.id, machine.machineSeal(demo.id)), null);
    await assert.rejects(() => machine.ensureVoiceMachine(demo.id), machine.VoiceMachineColumnMissing);
  } finally {
    prisma.$queryRaw = queryRaw;
    prisma.$executeRaw = executeRaw;
    await prisma.business.deleteMany({ where: { id: { in: [live.id, demo.id] } } });
  }
});

test("a live shop still gets its own door when the machine column is missing", async () => {
  const stamp = Date.now().toString(36);
  const live = await prisma.business.create({
    data: { name: `Missing Live ${stamp}`, slug: `missing-live-${stamp}`, environment: "production", ownerEmail: `missing-live-${stamp}@example.test` },
  });
  const demo = await prisma.business.create({
    data: { name: `Sample Shop ${stamp}`, slug: `missing-demo-${stamp}`, environment: "demo", ownerEmail: `missing-demo-${stamp}@example.test` },
  });
  const queryRaw = prisma.$queryRaw;
  const executeRaw = prisma.$executeRaw;
  const missing = () => {
    throw new Error("no such column: voiceMachineId");
  };
  prisma.$queryRaw = missing;
  prisma.$executeRaw = missing;
  try {
    assert.equal(await machine.ensureVoiceMachine(live.id), live.id);
    assert.match(await machine.shopReceptionistUrl(live), new RegExp(`/api/webhooks/vapi/machines/${live.id}$`));
    assert.match(await machine.shopReceptionistUrl(demo), /\/api\/webhooks\/vapi$/);
    assert.deepEqual(await machine.openVoiceMachine(live.id, machine.machineSeal(live.id)), { machineId: live.id, businessId: live.id });
    assert.equal(await machine.openVoiceMachine(live.id, machine.machineSeal("other-shop")), null);
    assert.equal(await machine.openVoiceMachine(demo.id, machine.machineSeal(demo.id)), null);
    await assert.rejects(() => machine.ensureVoiceMachine(demo.id), machine.VoiceMachineColumnMissing);
    const pointed = buildBusinessAssistantConfig({
      ...live,
      voiceMachineId: live.id,
    });
    assert.match(pointed.serverUrl, new RegExp(`/api/webhooks/vapi/machines/${live.id}$`));
    assert.equal(pointed.serverUrlSecret, machine.machineSeal(live.id));
  } finally {
    prisma.$queryRaw = queryRaw;
    prisma.$executeRaw = executeRaw;
    await prisma.business.deleteMany({ where: { id: { in: [live.id, demo.id] } } });
  }
});
