#!/usr/bin/env node
/*
 * The daily test call: once a day Orvius rings a live shop line from itself
 * and asks a question. It passes only when the receptionist answered the
 * caller, it never becomes a call, lead or alert on the shop, and a failure
 * reaches the founders the same morning.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { readFileSync } from "node:fs";

process.env.RESEND_API_KEY = "re_test_key";
delete process.env.RESEND_FROM;
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";

const nextServer = await import("next/server");
const deferred = [];
mock.module("next/server", { namedExports: { ...nextServer, after: (task) => deferred.push(task) } });

const { prisma } = await import("../src/lib/prisma.ts");
const { lineCheckVerdict, startDailyLineCheck, settleStaleLineChecks, lastLineCheck, LINE_CHECK_TWIML } = await import("../src/lib/line-check.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const say = (role, message) => ({ role, message });

function captureEmails() {
  const realFetch = globalThis.fetch;
  const emails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "e" }), { status: 200 });
    }
    return realFetch(url, init);
  };
  return { emails, restore: () => (globalThis.fetch = realFetch) };
}

test("it passes only when the receptionist answered the caller, not when something merely picked up", () => {
  assert.deepEqual(
    lineCheckVerdict({ artifact: { messages: [say("system", "prompt"), say("bot", "Thanks for calling"), say("user", "Are you open today?"), say("bot", "We are, until 5.")] } }),
    { passed: true, reason: null },
  );
  assert.match(lineCheckVerdict({ artifact: { messages: [] }, endedReason: "pipeline-error-openai-llm-failed" }).reason, /never spoke\. Vapi ended it with "pipeline-error-openai-llm-failed"/);
  assert.match(lineCheckVerdict({ artifact: { messages: [say("bot", "Thanks for calling")] } }).reason, /never heard the caller/);
  assert.match(
    lineCheckVerdict({ artifact: { messages: [say("bot", "Thanks for calling"), say("user", "Are you open today?")] } }).reason,
    /never answered the caller's question/,
  );
  assert.match(LINE_CHECK_TWIML, /<Say[^>]*>Hi, are you open today\?<\/Say>/);
});

test("it places one call a day, from a live line to itself, in the early hours only", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Line Check HVAC",
      slug: `line-check-${uid()}`,
      environment: "production",
      isActive: true,
      billingStatus: "active",
      vapiAssistantId: `asst-${uid()}`,
      twilioPhone: "+13035550188",
      hoursJson: "{}",
      servicesJson: "[]",
    },
  });
  const placed = [];
  const client = { calls: Object.assign(() => ({ fetch: async () => ({ status: "completed" }) }), { create: async (input) => (placed.push(input), { sid: `CA${uid()}` }) }) };
  const day = new Date("2031-07-08T07:30:00Z");
  try {
    assert.deepEqual(await startDailyLineCheck(new Date("2031-07-08T15:00:00Z"), { client }), { ran: false, reason: "outside the window" });
    const first = await startDailyLineCheck(day, { client });
    assert.equal(first.ran, true);
    assert.equal(first.placed, true);
    assert.equal(placed.length, 1);
    const picked = await prisma.business.findUnique({ where: { id: first.businessId } });
    assert.equal(picked.environment, "production", "real shops only");
    assert.equal(placed[0].from, picked.twilioPhone);
    assert.equal(placed[0].to, picked.vapiPhoneNumber ?? picked.twilioPhone, "it rings the line customers reach");
    assert.deepEqual(await startDailyLineCheck(new Date("2031-07-08T08:00:00Z"), { client }), { ran: false, reason: "already ran today" });
    assert.equal(placed.length, 1, "once a day, not every 30 minutes");
    assert.equal((await lastLineCheck()).status, "calling");
  } finally {
    await prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: "line-check", externalId: "2031-07-08" } });
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

async function shopWithCheck(createdAt = new Date()) {
  const number = () => `+1303555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const from = number();
  const line = number();
  const shop = await prisma.business.create({
    data: { name: "Webhook Check HVAC", slug: `line-check-wh-${uid()}`, environment: "test", isActive: true, vapiAssistantId: `asst-${uid()}`, twilioPhone: from, vapiPhoneNumber: line, hoursJson: "{}", servicesJson: "[]" },
  });
  const check = await prisma.webhookEvent.create({
    data: {
      source: "orvius",
      eventType: "line-check",
      externalId: `test-${uid()}`,
      businessId: shop.id,
      status: "calling",
      createdAt,
      payloadJson: JSON.stringify({ businessId: shop.id, shop: shop.name, line, sid: `CA${uid()}` }),
    },
  });
  return { shop, from, line, check };
}

test("the test call reaches the webhook, is graded, and never becomes a call, a lead or an alert", async () => {
  const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");
  const { shop, from, line, check } = await shopWithCheck();
  const vapiCallId = `vc-check-${uid()}`;
  const send = (message) =>
    POST(
      new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET ?? "" },
        body: JSON.stringify({ message: { ...message, call: { id: vapiCallId, assistantId: shop.vapiAssistantId, customer: { number: from }, phoneNumber: { number: line } } } }),
      }),
    );
  const mail = captureEmails();
  try {
    assert.equal((await send({ type: "status-update", status: "in-progress" })).status, 200);
    const tools = await (await send({ type: "tool-calls", toolCallList: [{ id: "t1", function: { name: "check_availability", arguments: "{}" } }] })).json();
    assert.deepEqual(tools.results.map((r) => r.toolCallId), ["t1"]);
    const report = await send({
      type: "end-of-call-report",
      endedReason: "customer-ended-call",
      artifact: {
        messages: [say("bot", "Thanks for calling"), say("user", "Are you open today?"), say("bot", "Yes, until five.")],
        performanceMetrics: { turnLatencies: [{ turnLatency: 900 }, { turnLatency: 1100 }] },
      },
    });
    assert.equal((await report.json()).lineCheck, true);
    for (const task of deferred.splice(0)) await task().catch(() => {});
    assert.equal(await prisma.call.count({ where: { vapiCallId } }), 0, "no call row on the shop");
    assert.equal(await prisma.lead.count({ where: { businessId: shop.id } }), 0, "no lead");
    const settled = await prisma.webhookEvent.findUnique({ where: { id: check.id } });
    assert.equal(settled.status, "passed");
    assert.equal(JSON.parse(settled.payloadJson).replyP90Ms, 1100);
    assert.equal(mail.emails.length, 0, "a pass is quiet");
  } finally {
    mail.restore();
    await prisma.webhookEvent.deleteMany({ where: { id: check.id } });
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("a call Vapi never reported fails with what the carrier saw, and the founders hear it once", async () => {
  const { shop, check } = await shopWithCheck(new Date(Date.now() - 20 * 60_000));
  const client = { calls: Object.assign(() => ({ fetch: async () => ({ status: "no-answer" }) }), { create: async () => ({ sid: "unused" }) }) };
  const mail = captureEmails();
  try {
    assert.equal((await settleStaleLineChecks(new Date(), { client })).failed >= 1, true);
    const settled = await prisma.webhookEvent.findUnique({ where: { id: check.id } });
    assert.equal(settled.status, "failed");
    assert.match(settled.error, /rang out and nothing answered/);
    assert.equal(mail.emails.length, 1);
    assert.match(mail.emails[0].subject, /test call to Webhook Check HVAC failed/);
    await settleStaleLineChecks(new Date(), { client });
    assert.equal(mail.emails.length, 1, "one alarm per failed call");
  } finally {
    mail.restore();
    await prisma.webhookEvent.deleteMany({ where: { id: check.id } });
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("it runs from the 30-minute sweep and shows on the admin Launch tab", async () => {
  assert.match(readFileSync("src/lib/line-watch-sweep.ts", "utf8"), /settleStaleLineChecks\(\)\s*\.then\(\(\) => startDailyLineCheck\(\)\)/);
  assert.match(readFileSync("src/app/api/admin/vendor-alarms/route.ts", "utf8"), /lastLineCheck\(\)/);
  assert.match(readFileSync("src/components/vendor-alarm-card.tsx", "utf8"), /Daily test call/);
  const webhook = readFileSync("src/app/api/webhooks/vapi/route.ts", "utf8");
  assert.match(webhook, /phonesEqual\(caller, business\.twilioPhone\) \|\| phonesEqual\(caller, business\.vapiPhoneNumber\)\)\) \{\s*const lineCheck = await lineCheckInFlight/, "only a shop's own number costs the lookup");
  await prisma.$disconnect();
});
