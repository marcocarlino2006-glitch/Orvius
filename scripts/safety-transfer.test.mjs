/*
 * Live safety handling (docs/BACKLOG.md M2): a gas, carbon monoxide, smoke or
 * sparking call texts the owner while the caller is still on the line, and a
 * shop with a transfer number gets the caller put through warm — the owner
 * hears who is calling and why before the caller is connected.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { buildAssistantSystemPrompt } = await import("../src/lib/business.ts");
const { buildVapiAssistantConfig } = await import("../src/lib/vapi.ts");
const { handleInCallToolCalls } = await import("../src/lib/in-call-tools.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const promptFor = (extra) =>
  buildAssistantSystemPrompt({ name: "Safe Air", greeting: null, hoursJson: "{}", servicesJson: "[]", trade: "HVAC", ...extra });

async function makeShop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Safe Air",
      slug: `safe-${stamp()}`,
      environment: "test",
      trade: "HVAC",
      ownerPhone: "+15125550188",
      ownerEmail: `owner-${stamp()}@example.test`,
      ...extra,
    },
  });
}
const toolsShop = (shop) => ({
  id: shop.id,
  name: shop.name,
  hoursJson: shop.hoursJson,
  timezone: shop.timezone,
  trade: shop.trade,
  servicesJson: shop.servicesJson,
  ownerPhone: shop.ownerPhone,
  ownerEmail: shop.ownerEmail,
  transferPhone: shop.transferPhone,
});

test("the transfer is warm: the owner hears a summary of the call before the caller is put through", () => {
  const config = buildVapiAssistantConfig({
    businessName: "Safe Air",
    greeting: "Hi",
    systemPrompt: "x",
    webhookUrl: "https://app.orvius.im/api/webhooks/vapi",
    transferPhone: "+15125550199",
    inCallBooking: true,
  });
  const transfer = config.model.tools.find((t) => t.type === "transferCall");
  const [destination] = transfer.destinations;
  assert.equal(destination.transferPlan.mode, "warm-transfer-wait-for-operator-to-speak-first-and-then-say-summary");
  assert.equal(destination.transferPlan.summaryPlan.enabled, true);
  assert.ok(destination.transferPlan.summaryPlan.messages.some((m) => m.content === "{{transcript}}"));
  assert.match(destination.transferPlan.summaryPlan.messages[0].content, /Safety call/);
  assert.match(destination.description, /danger calls/);
  assert.ok(config.model.tools.some((t) => t.function?.name === "alert_team_now"));
});

test("the danger rule alerts the team mid-call, and transfers only when the shop has a transfer number", () => {
  const withTransfer = promptFor({ canBook: true, canTransfer: true });
  const danger = withTransfer.split("\n").find((line) => line.startsWith("- DANGER"));
  assert.match(danger, /Please leave the home now/);
  assert.match(danger, /alert_team_now/);
  assert.match(danger, /transfer tool/);

  const noTransfer = promptFor({ canBook: true, canTransfer: false }).split("\n").find((l) => l.startsWith("- DANGER"));
  assert.match(noTransfer, /alert_team_now/);
  assert.doesNotMatch(noTransfer, /transfer tool/);

  const preview = promptFor({ canBook: false, canTransfer: false }).split("\n").find((l) => l.startsWith("- DANGER"));
  assert.doesNotMatch(preview, /alert_team_now/, "no tool, no instruction to call it");
});

test("alert_team_now texts the owner once per call, with what the caller said", async () => {
  const shop = await makeShop({ transferPhone: "+15125550199" });
  try {
    const call = await prisma.call.create({
      data: { businessId: shop.id, vapiCallId: `danger-${stamp()}`, callerPhone: "+15125550123", status: "in-progress" },
    });
    const run = () =>
      handleInCallToolCalls({
        shop: toolsShop(shop),
        callId: call.id,
        call,
        toolCalls: [{ id: "t1", name: "alert_team_now", args: { hazard: "gas smell in the kitchen", address: "12 Elm St" } }],
      });
    const [first] = await run();
    await run();

    assert.match(first.result, /owner has been texted/);
    assert.match(first.result, /transfer tool/);
    const sms = await prisma.ownerNotification.findMany({ where: { businessId: shop.id, channel: "sms" } });
    assert.equal(sms.length, 1, "a repeated tool call texts once");
    assert.equal(sms[0].dedupeKey, `safety-live:${call.vapiCallId}`);
    assert.match(sms[0].message, /^SAFETY CALL, caller on the line now: gas smell in the kitchen\./);
    assert.match(sms[0].message, /12 Elm St/);
    assert.match(sms[0].message, /\+1 512 555 0123/);
    assert.match(sms[0].message, /connecting them to your transfer number/);
  } finally {
    await drop(shop.id);
  }
});

test("without a transfer number the caller is told the team will call right back", async () => {
  const shop = await makeShop();
  try {
    const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `danger-${stamp()}`, status: "in-progress" } });
    const [result] = await handleInCallToolCalls({
      shop: toolsShop(shop),
      callId: call.id,
      call,
      toolCalls: [{ id: "t1", name: "alert_team_now", args: { hazard: "CO alarm going off" } }],
    });
    assert.match(result.result, /call you right back/);
    assert.doesNotMatch(result.result, /transfer tool/);
    const sms = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, channel: "sms" } });
    assert.match(sms.message, /Call them back now\./);
  } finally {
    await drop(shop.id);
  }
});

test("the schedule tool refuses a danger call and points at the alert, instead of claiming one was sent", async () => {
  const shop = await makeShop();
  try {
    const call = await prisma.call.create({ data: { businessId: shop.id, vapiCallId: `danger-${stamp()}`, status: "in-progress" } });
    const [result] = await handleInCallToolCalls({
      shop: toolsShop(shop),
      callId: call.id,
      toolCalls: [{ id: "c", name: "check_availability", args: { serviceType: "I smell gas near the furnace" } }],
    });
    assert.match(result.result, /^Do not book this\./);
    assert.match(result.result, /alert_team_now/);
    assert.doesNotMatch(result.result, /being alerted now/);
  } finally {
    await drop(shop.id);
  }
});
