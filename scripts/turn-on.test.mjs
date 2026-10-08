#!/usr/bin/env node
/*
 * Turning Orvius on: a stranger reaches a real, clearly labelled test without
 * a card or a phone line, and only an explicit, paid go-live reaches people.
 *
 * The test call runs the real pipeline against a test-mode shop, so what is
 * graded is what an owner would see: the request, the schedule decision, the
 * messages (all simulated) and the exception.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  PERMISSION_LEVELS,
  SETUP_TRADES,
  buildGoLiveChecklist,
  isSetupSandbox,
  needsServiceArea,
  parseSetup,
  permissionLevelFor,
  permissionSettings,
  setupScenarios,
} from "../src/lib/setup-flow.ts";
import { HIPAA_TRADES } from "../src/lib/trades.ts";
import { classifyRequest } from "../src/lib/trade-playbooks.ts";
import { isOnboardingComplete } from "../src/lib/provision-business.ts";
import {
  findSetupSandbox,
  readSetupTest,
  runSetupTest,
  saveSetupDay,
  saveSetupPermissions,
  startSetup,
} from "../src/lib/setup-sandbox.ts";

const prisma = new PrismaClient();
const read = (path) => readFileSync(path, "utf8");
const email = () => `turn-on-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@orvius.invalid`;

test.after(async () => {
  await prisma.business.deleteMany({ where: { ownerEmail: { startsWith: "turn-on-" } } });
  await prisma.$disconnect();
});

test("only business types Orvius supports are offered", () => {
  for (const trade of HIPAA_TRADES) assert.ok(!SETUP_TRADES.includes(trade), trade);
  assert.ok(SETUP_TRADES.includes("HVAC"));
  assert.equal(needsServiceArea("Plumbing"), true);
  assert.equal(needsServiceArea("Salon & spa"), false);
});

test("every trade's routine test call is everyday work, and its exception is never bookable work", () => {
  for (const trade of SETUP_TRADES) {
    const [routine, exception] = setupScenarios({ trade });
    const plain = classifyRequest({ business: { trade }, serviceType: routine.serviceType });
    assert.equal(plain.safety, null, `${trade}: routine call "${routine.serviceType}" reads as a safety call`);
    if (exception.urgency === "emergency") {
      const hazard = classifyRequest({ business: { trade }, serviceType: exception.serviceType });
      assert.ok(hazard.safety, `${trade}: emergency "${exception.serviceType}" is not recognised as a safety call`);
    } else {
      assert.match(exception.lines.join(" "), /still not fixed|money back/);
    }
    for (const s of [routine, exception]) assert.match(s.phone, /^\+1312555016\d$/, "test callers use reserved 555 numbers");
  }
});

test("permission levels map to the settings that enforce them", () => {
  assert.deepEqual(permissionSettings("alert"), { bookingMode: "alert", autopilot: false });
  assert.deepEqual(permissionSettings("offer"), { bookingMode: "book", autopilot: false });
  assert.deepEqual(permissionSettings("confirm"), { bookingMode: "book", autopilot: true });
  for (const level of PERMISSION_LEVELS) assert.equal(permissionLevelFor(permissionSettings(level.id)), level.id);
});

test("test mode is a test environment marked sandbox; nothing else counts", () => {
  assert.equal(isSetupSandbox({ environment: "test", setupJson: '{"sandbox":true}' }), true);
  assert.equal(isSetupSandbox({ environment: "production", setupJson: '{"sandbox":true}' }), false);
  assert.equal(isSetupSandbox({ environment: "test", setupJson: "{}" }), false);
  assert.deepEqual(parseSetup("not json"), {});
});

test("the go-live checklist says plainly what is live, not connected, or needs approval", () => {
  const before = buildGoLiveChecklist({
    sandbox: true,
    line: null,
    lineVerifiedAt: null,
    overflowForwardConfirmedAt: null,
    ownerPhone: null,
    recordingDisclosed: false,
  });
  assert.deepEqual(
    before.map((i) => [i.id, i.state]),
    [
      ["permission", "needs_approval"],
      ["line", "not_connected"],
      ["forward", "not_connected"],
      ["messaging", "not_connected"],
      ["recording", "needs_approval"],
    ],
  );
  const after = buildGoLiveChecklist({
    sandbox: false,
    line: "+15125550100",
    lineVerifiedAt: new Date(),
    overflowForwardConfirmedAt: new Date(),
    ownerPhone: "+15125550111",
    recordingDisclosed: true,
  });
  assert.ok(after.every((i) => i.state === "live"));
});

test("a test-mode shop runs the real pipeline: alert-first holds, book-and-confirm books, safety escalates, every text simulated", async () => {
  const owner = email();
  const shop = await startSetup(owner, { name: "Turn On Heating", trade: "HVAC", timezone: "America/Chicago" });
  assert.equal(shop.environment, "test");
  assert.equal(shop.vapiAssistantId, null);
  assert.equal(shop.twilioPhone, null);
  assert.equal(await isOnboardingComplete(owner), false, "test mode is not a finished shop");
  await saveSetupDay(owner, { hours: "every_day", team: "crew", crew: [{ name: "Ana", phone: "3125550171" }] });

  await saveSetupPermissions(owner, "alert", false);
  await runSetupTest(owner, "routine");
  let result = await readSetupTest((await findSetupSandbox(owner)));
  assert.equal(result.decision.outcome, "held");
  assert.match(result.decision.headline, /decide every booking yourself/);
  assert.ok(result.request?.need);

  await saveSetupPermissions(owner, "confirm", true);
  await runSetupTest(owner, "routine");
  result = await readSetupTest((await findSetupSandbox(owner)));
  assert.equal(result.decision.outcome, "booked");
  assert.ok(result.messages.some((m) => m.to === "customer"), "the caller's confirmation is shown");
  assert.ok(result.messages.length > 0 && result.messages.every((m) => m.simulated), "every message is simulated");
  assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1, "each test starts from a clean slate");

  await runSetupTest(owner, "exception");
  result = await readSetupTest((await findSetupSandbox(owner)));
  assert.equal(result.decision.outcome, "escalated");
  assert.ok(result.exception);
  assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 0);
});

test("an owner whose business is live cannot start test mode over it", async () => {
  const owner = email();
  await prisma.business.create({
    data: { name: "Live Shop", slug: `turn-on-live-${Date.now()}`, ownerEmail: owner, environment: "production" },
  });
  await assert.rejects(() => startSetup(owner, { name: "Again", trade: "HVAC" }), /already live/);
});

test("going live is the only way out of test mode, and it keeps the shop", () => {
  const provision = read("src/lib/provision-business.ts");
  assert.match(provision, /promoteBusinessId/);
  assert.match(provision, /clearTestRecords/);
  assert.match(provision, /environment: "production"/);
  const checkout = read("src/app/api/billing/checkout/route.ts");
  assert.match(checkout, /turningOn/);
  assert.match(checkout, /\(!business \|\| turningOn\) && !body\.shop/);
  const webhook = read("src/app/api/billing/webhook/route.ts");
  assert.match(webhook, /isSetupSandbox/);
});

test("alert-first is enforced on the call, in booking and in the owner's text", () => {
  assert.match(read("src/lib/in-call-tools.ts"), /bookingMode === "alert"\) return OWNER_SETS_TIMES_REPLY/);
  assert.match(read("src/lib/auto-job.ts"), /bookingMode === "alert"/);
  assert.match(read("src/lib/owner-alert-message.ts"), /owner_first/);
  assert.match(read("src/lib/sync-business-assistant.ts"), /offerTimes: business\.bookingMode !== "alert"/);
});

test("Command in test mode says so and never asks for a card on its own", () => {
  const shell = read("src/components/os-shell.tsx");
  assert.match(shell, /business\?\.testMode \?/);
  assert.match(shell, /Calls and texts are simulated/);
  assert.match(read("src/components/pay-prompt-modal.tsx"), /environment === "test"/);
  const flow = read("src/components/turn-on-orvius.tsx");
  assert.match(flow, /Simulated, not sent/);
  assert.match(flow, /I approve it\./);
  assert.match(flow, /It may answer real callers with the permissions I chose/);
});
