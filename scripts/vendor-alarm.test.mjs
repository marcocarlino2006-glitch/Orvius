#!/usr/bin/env node
/*
 * A provider refusing what Orvius sends it reaches the founders the same day:
 * a retired voice model failed every receptionist save for ten days before
 * anyone read the logs. One email per kind of refusal per day, repeats counted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.RESEND_API_KEY = "re_test_key";
delete process.env.RESEND_FROM;
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";
process.env.VAPI_API_KEY = "vapi-test";

const { isVendorBreak, alarmFingerprint, raiseVendorAlarm, recentVendorAlarms } = await import("../src/lib/vendor-alarm.ts");
const { vapiRequest } = await import("../src/lib/vapi.ts");

const prisma = new PrismaClient();
const word = () => Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

const realFetch = globalThis.fetch;
let emails = [];
let vapiReply = null;
test.beforeEach(() => {
  emails = [];
  vapiReply = null;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.startsWith("https://api.resend.com")) {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    }
    if (href.startsWith("https://api.vapi.ai") && vapiReply) return new Response(vapiReply.body, { status: vapiReply.status });
    throw new Error(`unexpected fetch ${href}`);
  };
});
test.after(async () => {
  globalThis.fetch = realFetch;
  await prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: { startsWith: "vendor-alarm:" } } });
  await prisma.$disconnect();
});

test("only a refusal is an alarm: missing, conflicting, rate-limited and outages are routine", () => {
  for (const status of [400, 401, 403, 422]) assert.equal(isVendorBreak(status), true, String(status));
  for (const status of [404, 408, 409, 429, 500, 503, null, undefined]) assert.equal(isVendorBreak(status), false, String(status));
});

test("the same refusal about different shops is one kind", () => {
  const a = alarmFingerprint("vapi", "PATCH /assistant/:id", "Assistant 3f2c9a1e-1111-2222-3333-444455556666 has retired model on +1 512 555 0100");
  const b = alarmFingerprint("vapi", "PATCH /assistant/:id", "Assistant 9a9a9a9a-aaaa-bbbb-cccc-ddddeeeeffff has retired model on +1 737 555 0199");
  assert.equal(a, b);
  assert.notEqual(a, alarmFingerprint("vapi", "PATCH /assistant/:id", "voice id not found"));
});

test("the first refusal of a kind emails the founders with the provider's words; repeats only count", async () => {
  const message = `Retired models cannot be saved ${word()}`;
  assert.equal(await raiseVendorAlarm({ vendor: "vapi", operation: "PATCH /assistant/:id", status: 400, message, businessId: "shop-1" }), "emailed");
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, ["founder@orvius.test"]);
  assert.match(emails[0].subject, /Vapi \(voice\) is refusing PATCH \/assistant\/:id/);
  assert.match(emails[0].text, new RegExp(message));
  assert.equal(await raiseVendorAlarm({ vendor: "vapi", operation: "PATCH /assistant/:id", status: 400, message }), "counted");
  assert.equal(emails.length, 1, "a repeat is not emailed again");
  const row = (await recentVendorAlarms(1)).find((alarm) => alarm.message.includes(message));
  assert.ok(row);
  assert.equal(row.count, 2);
  assert.equal(row.vendor, "vapi");
  assert.equal(row.status, 400);
});

test("a routine status is not an alarm, and a broken email provider is shown, not emailed about", async () => {
  assert.equal(await raiseVendorAlarm({ vendor: "vapi", operation: "GET /call/:id", status: 404, message: "not found" }), "ignored");
  assert.equal(await raiseVendorAlarm({ vendor: "resend", operation: "send email", status: 403, message: `domain not verified ${word()}` }), "logged");
  assert.equal(emails.length, 0);
});

test("a Vapi refusal raises the alarm and still fails the request", async () => {
  const body = JSON.stringify({ message: `cartesia/sonic-x was retired ${word()}` });
  vapiReply = { status: 400, body };
  await assert.rejects(vapiRequest("/assistant/3f2c9a1e-1111-2222-3333-444455556666", { method: "PATCH", body: "{}" }), /Vapi API error \(400\)/);
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /PATCH \/assistant\/:id/, "the shop's assistant id is not in the alarm's kind");
});

test("texting and email refusals are wired to the alarm, and the admin Launch tab shows them", () => {
  assert.match(readFileSync("src/lib/twilio-sms.ts", "utf8"), /kind === "rejected"\) \{\s+const \{ raiseVendorAlarm \}/);
  assert.match(readFileSync("src/lib/email.ts", "utf8"), /raiseVendorAlarm\(\{ vendor: "resend"/);
  assert.match(readFileSync("src/app/admin/page.tsx", "utf8"), /<VendorAlarmCard \/>/);
});

test("once a day one live receptionist is saved again, so a provider that starts refusing saves is caught that day", async () => {
  const { selfTestOneReceptionist, lastReceptionistSelfTest } = await import("../src/lib/receptionist-self-test.ts");
  const day = new Date("2031-03-04T12:00:00Z");
  const shop = await prisma.business.create({
    data: { name: "Self Test HVAC", slug: `self-test-${word()}`, environment: "live", isActive: true, vapiAssistantId: `asst-${word()}`, hoursJson: "{}", servicesJson: "[]" },
  });
  try {
    const saved = [];
    const first = await selfTestOneReceptionist(day, { sync: async (b) => { saved.push(b.id); throw new Error("Vapi API error (400): retired model"); } });
    assert.equal(first.ran, true);
    assert.equal(first.ok, false);
    assert.equal(saved.length, 1);
    assert.deepEqual(await selfTestOneReceptionist(day, { sync: async () => saved.push("again") }), { ran: false, reason: "already ran today" });
    assert.equal(saved.length, 1, "once a day, not every 30 minutes");
    const last = await lastReceptionistSelfTest();
    assert.equal(last.status, "failed");
    assert.match(last.error, /retired model/);
    assert.match(readFileSync("src/lib/line-watch-sweep.ts", "utf8"), /selfTestOneReceptionist\(\)/);
  } finally {
    await prisma.webhookEvent.deleteMany({ where: { source: "orvius", eventType: "self-test:receptionist-save", externalId: "2031-03-04" } });
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});
