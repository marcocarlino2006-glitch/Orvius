#!/usr/bin/env node
/*
 * Website chat: a visitor's message and number land in the inbox as a lead
 * and a thread, they are texted that it arrived, the owner is told, and
 * their reply by text continues that conversation instead of opening another.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { startWebChat, webChatAck, hasOpenWebChat, WEB_CHAT_WINDOW_MS } = await import("../src/lib/web-chat.ts");
const { publicShop } = await import("../src/lib/online-booking.ts");
const chatRoute = await import("../src/app/api/public/chat/[slug]/route.ts");
const embed = await import("../src/app/embed.js/route.ts");
const sms = await import("../src/app/api/webhooks/twilio/sms/route.ts");
const { NextRequest } = await import("next/server");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

async function shop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Rapid Flow Plumbing",
      slug: `wc-${stamp()}`,
      trade: "Plumbing",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      environment: "live",
      billingStatus: "active",
      webChatOn: true,
      vapiPhoneNumber: randomPhone(),
      ownerPhone: randomPhone(),
      ownerEmail: `owner-${stamp()}@example.test`,
      ...overrides,
    },
  });
}

function fakeSms() {
  const sent = [];
  return { sent, send: async (p) => (sent.push(p), { sent: true, sid: `SM${sent.length}` }) };
}

test("the acknowledgment: who, that it arrived, a way out", () => {
  assert.equal(
    webChatAck({ businessName: "Rapid Flow Plumbing", name: "Ann Cole" }),
    "Hi Ann, thanks for reaching out to Rapid Flow Plumbing. We got your message and will text you back here shortly. Reply STOP to opt out.",
  );
});

test("a chat lands as a lead and a thread, the visitor is texted, the owner told", async () => {
  const business = await shop();
  try {
    const live = await publicShop(business.slug, "webChatOn");
    const phone = randomPhone();
    const fake = fakeSms();
    const result = await startWebChat(live, { name: "Ann Cole", phone, message: "Kitchen sink is draining slowly" }, fake.send);
    assert.deepEqual(result, { ok: true, texted: true, safety: null });
    assert.equal(fake.sent.length, 1);
    assert.equal(fake.sent[0].to, phone);

    const lead = await prisma.lead.findFirstOrThrow({ where: { businessId: business.id } });
    assert.equal(lead.source, "chat");
    assert.equal(lead.notes, "Kitchen sink is draining slowly");
    const msg = await prisma.message.findFirstOrThrow({ where: { businessId: business.id, direction: "in" } });
    assert.equal(msg.body, "Kitchen sink is draining slowly");
    const alert = await prisma.ownerNotification.findFirstOrThrow({ where: { businessId: business.id } });
    assert.match(alert.message, /Web chat from Ann Cole/);
    assert.equal(await hasOpenWebChat(business.id, phone), true);
    assert.equal(await hasOpenWebChat(business.id, phone, new Date(Date.now() + WEB_CHAT_WINDOW_MS + 60_000)), false);
  } finally {
    await drop(business.id);
  }
});

test("danger in a chat is flagged to the owner and the visitor sees 911", async () => {
  const business = await shop();
  try {
    const live = await publicShop(business.slug, "webChatOn");
    const result = await startWebChat(live, { name: "", phone: randomPhone(), message: "I smell gas near the water heater" }, fakeSms().send);
    assert.equal(result.ok, true);
    assert.ok(result.safety);
    const alert = await prisma.ownerNotification.findFirstOrThrow({ where: { businessId: business.id } });
    assert.match(alert.message, /^SAFETY/);
  } finally {
    await drop(business.id);
  }
});

test("their text reply continues the chat: no second lead, no auto-reply", async () => {
  const business = await shop();
  try {
    const live = await publicShop(business.slug, "webChatOn");
    const phone = randomPhone();
    await startWebChat(live, { name: "Ann Cole", phone, message: "Need a quote for a new water heater" }, fakeSms().send);
    const res = await sms.POST(
      new NextRequest("http://localhost/api/webhooks/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: phone, To: business.vapiPhoneNumber, Body: "Tuesday morning is best", MessageSid: `SM${stamp()}` }),
      }),
    );
    assert.equal(await res.text(), "<Response></Response>");
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 1);
    assert.equal(await prisma.message.count({ where: { businessId: business.id, direction: "in" } }), 2);
  } finally {
    await drop(business.id);
  }
});

test("off means off: no API, an empty embed, and bad input refused", async () => {
  const off = await shop({ webChatOn: false });
  const on = await shop();
  try {
    const ctx = (slug) => ({ params: Promise.resolve({ slug }) });
    assert.equal((await chatRoute.GET(new Request("http://x/api/public/chat/" + off.slug), ctx(off.slug))).status, 404);
    const stale = await (await embed.GET(new Request(`http://x/embed.js?shop=${off.slug}`))).text();
    assert.doesNotMatch(stale, /createElement/);
    const live = await (await embed.GET(new Request(`https://app.example/embed.js?shop=${on.slug}`))).text();
    assert.match(live, /createElement\("iframe"\)/);
    assert.match(live, new RegExp(`/w/${on.slug}\\?embed=1`));
    assert.match(live, /var origin = me \? new URL\(me\)\.origin : "https:\/\/app\.example"/, "the script finds Orvius from its own src");
    assert.match(live, /e\.origin === origin/, "only Orvius's own frame can close the panel");

    const post = (body) =>
      chatRoute.POST(
        new Request("http://x/api/public/chat/" + on.slug, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
          body: JSON.stringify(body),
        }),
        ctx(on.slug),
      );
    assert.equal((await post({ phone: "123", message: "hi" })).status, 400);
    assert.equal((await post({ phone: randomPhone(), message: "hi", website: "spam" })).status, 400);
    assert.equal(await prisma.lead.count({ where: { businessId: on.id } }), 0);
  } finally {
    await drop(off.id);
    await drop(on.id);
  }
});

test("only the chat and booking pages can be framed by another site", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /source: "\/\(\(\?!w\/\|b\/\)\.\*\)"/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /source: "\/\(w\|b\)\/:path\*"/);
});

test.after(() => prisma.$disconnect());
