#!/usr/bin/env node
/*
 * An owner who walks away from setup hears from Orvius an hour, a day and
 * three days later, and never again after paying, stopping the emails, or the
 * third one. A shop that goes live gets one welcome, and its first real
 * customer call gets one note. Every email is HTML with the same words as
 * plain text, and carries a one-click way to stop them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.AUTH_SECRET = "lifecycle-test-secret";
process.env.RESEND_API_KEY = "re_test";
delete process.env.RESEND_FROM;

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.resend.com/")) {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 });
  }
  return realFetch(url, init);
};

const {
  recoveryStageDue,
  sendLifecycleEmails,
  lifecycleEmailToken,
  verifyLifecycleEmailToken,
  lifecycleEmailsStopped,
} = await import("../src/lib/lifecycle-email.ts");
const { renderEmail } = await import("../src/lib/email-layout.ts");
const { POST: stopPost } = await import("../src/app/api/public/setup-emails/route.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];
test.after(async () => {
  globalThis.fetch = realFetch;
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function sandbox({ quietMs, heard = false, email = `o-${uid()}@example.test` }) {
  const done = { business: new Date().toISOString(), ...(heard ? { test: new Date().toISOString() } : {}) };
  const shop = await prisma.business.create({
    data: {
      name: `Comfort ${uid()}`,
      slug: `life-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: email,
      setupJson: JSON.stringify({ sandbox: true, done, ...(heard ? { testedAt: done.test } : {}) }),
    },
  });
  made.push(shop.id);
  await prisma.business.update({ where: { id: shop.id }, data: { updatedAt: new Date(Date.now() - quietMs) } });
  return shop;
}

const to = (email) => sent.filter((m) => m.to[0] === email);

test("each nudge waits its turn, the highest due one goes, and none goes twice", () => {
  assert.equal(recoveryStageDue({ quietMs: 30 * 60 * 1000, sentStages: [], optedOut: false }), null);
  assert.equal(recoveryStageDue({ quietMs: 2 * HOUR, sentStages: [], optedOut: false }), 1);
  assert.equal(recoveryStageDue({ quietMs: 2 * HOUR, sentStages: [1], optedOut: false }), null);
  assert.equal(recoveryStageDue({ quietMs: 30 * HOUR, sentStages: [1], optedOut: false }), 2);
  assert.equal(recoveryStageDue({ quietMs: 4 * DAY, sentStages: [1, 2], optedOut: false }), 3);
  assert.equal(recoveryStageDue({ quietMs: 4 * DAY, sentStages: [3], optedOut: false }), null);
  assert.equal(recoveryStageDue({ quietMs: 2 * DAY, sentStages: [], optedOut: false }), 2);
  assert.equal(recoveryStageDue({ quietMs: 8 * DAY, sentStages: [], optedOut: false }), null);
  assert.equal(recoveryStageDue({ quietMs: 2 * HOUR, sentStages: [], optedOut: true }), null);
});

test("the email is escaped HTML with the same words as plain text", () => {
  const { html, text } = renderEmail({
    preheader: "Hello",
    heading: "Tom & <Sons> is live",
    paragraphs: ["Calls are answered."],
    facts: [["Your number", "+1 555 010 0000"]],
    action: { label: "Open Orvius", href: "https://orvius.im/dashboard" },
    unsubscribeHref: "https://orvius.im/unsubscribe/setup?t=x",
  });
  assert.match(html, /Tom &amp; &lt;Sons&gt; is live/);
  assert.doesNotMatch(html, /<Sons>/);
  assert.match(html, /href="https:\/\/orvius\.im\/dashboard"/);
  assert.match(html, /Stop these emails/);
  assert.match(text, /Tom & <Sons> is live/);
  assert.match(text, /Open Orvius: https:\/\/orvius\.im\/dashboard/);
  assert.match(text, /Stop these emails: https:\/\/orvius\.im\/unsubscribe\/setup/);
  const unsafe = renderEmail({ preheader: "", heading: "x", paragraphs: [], action: { label: "Go", href: "javascript:alert(1)" } });
  assert.doesNotMatch(unsafe.html, /javascript:/);
});

test("an owner who walked away an hour ago gets the first nudge once, then the next a day later", async () => {
  const shop = await sandbox({ quietMs: 2 * HOUR });
  const first = await sendLifecycleEmails();
  assert.equal(first.ready, true);
  const mail = to(shop.ownerEmail);
  assert.equal(mail.length, 1);
  assert.match(mail[0].subject, /one step from answering/);
  assert.match(mail[0].text, /hear it answer/i);
  assert.match(mail[0].html, /<!doctype html>/i);
  assert.equal(mail[0].reply_to, "support@orvius.im");
  assert.match(mail[0].headers["List-Unsubscribe"], /\/api\/public\/setup-emails\?t=/);
  assert.equal(mail[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  await sendLifecycleEmails();
  assert.equal(to(shop.ownerEmail).length, 1, "the same nudge never goes twice");

  await prisma.business.update({ where: { id: shop.id }, data: { updatedAt: new Date(Date.now() - 30 * HOUR) } });
  await sendLifecycleEmails();
  assert.equal(to(shop.ownerEmail).length, 2);
  assert.match(to(shop.ownerEmail)[1].subject, /Hear .* receptionist answer/);

  await prisma.business.update({ where: { id: shop.id }, data: { updatedAt: new Date(Date.now() - 4 * DAY) } });
  await sendLifecycleEmails();
  const last = to(shop.ownerEmail);
  assert.equal(last.length, 3);
  assert.match(last[2].subject, /Want a hand/);
  assert.match(last[2].text, /last of these/);
});

test("an owner who already heard it is pointed at the pay step", async () => {
  const shop = await sandbox({ quietMs: 2 * HOUR, heard: true });
  await sendLifecycleEmails();
  assert.match(to(shop.ownerEmail)[0].text, /You've heard it answer/);
});

test("an owner who went live, or stopped the emails, gets no nudge", async () => {
  const email = `o-${uid()}@example.test`;
  await sandbox({ quietMs: 2 * HOUR, email });
  const live = await prisma.business.create({
    data: { name: "Live Air", slug: `live-${uid()}`, environment: "production", trade: "HVAC", ownerEmail: email, billingStatus: "pilot" },
  });
  made.push(live.id);
  await sendLifecycleEmails();
  assert.equal(to(email).length, 0);

  const stopped = await sandbox({ quietMs: 2 * HOUR });
  const token = lifecycleEmailToken(stopped.id);
  assert.equal(verifyLifecycleEmailToken(token), stopped.id);
  assert.equal(verifyLifecycleEmailToken(`${stopped.id}.forged`), null);
  const res = await stopPost(
    new Request(`https://orvius.im/api/public/setup-emails?t=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": "198.51.100.7" },
      body: "List-Unsubscribe=One-Click",
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(await lifecycleEmailsStopped(stopped.id), true);
  await sendLifecycleEmails();
  assert.equal(to(stopped.ownerEmail).length, 0);

  const page = await stopPost(
    new Request(`https://orvius.im/api/public/setup-emails?t=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": "198.51.100.7" },
      body: "from=page",
    }),
  );
  assert.equal(page.status, 303);
  assert.match(page.headers.get("location"), /\/unsubscribe\/setup\?t=.*&stopped=1/);
});

test("a shop that goes live gets one welcome naming its number", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Welcome Plumbing",
      slug: `welcome-${uid()}`,
      environment: "production",
      trade: "Plumbing",
      ownerEmail: `o-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      vapiPhoneNumber: "+15550100123",
    },
  });
  made.push(shop.id);
  await sendLifecycleEmails();
  await sendLifecycleEmails();
  const mail = to(shop.ownerEmail);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].subject, "Welcome Plumbing is live on Orvius");
  assert.match(mail[0].text, /\+1 555 010 0123/);
});

test("the first real customer call gets one note; the owner's own test call does not count", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "First Call Electric",
      slug: `first-${uid()}`,
      environment: "production",
      trade: "Electrical",
      ownerEmail: `o-${uid()}@example.test`,
      ownerPhone: "+15550109999",
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  made.push(shop.id);
  await prisma.call.create({
    data: { businessId: shop.id, callerPhone: "+15550109999", status: "ended", durationSec: 60, summary: "Owner testing" },
  });
  await sendLifecycleEmails();
  assert.equal(to(shop.ownerEmail).filter((m) => /first call/.test(m.subject)).length, 0);

  const call = await prisma.call.create({
    data: { businessId: shop.id, callerPhone: "+15550104444", status: "ended", durationSec: 95, summary: "Breaker keeps tripping in the kitchen.", booked: true },
  });
  await sendLifecycleEmails();
  await sendLifecycleEmails();
  const notes = to(shop.ownerEmail).filter((m) => /first call/.test(m.subject));
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /Breaker keeps tripping/);
  assert.match(notes[0].text, /booked the visit/);
  assert.match(notes[0].text, new RegExp(`/dashboard/calls/${call.id}`));
});

test("a shop whose first call is already old is not told about it now", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Old Call Air",
      slug: `old-${uid()}`,
      environment: "production",
      trade: "HVAC",
      ownerEmail: `o-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      createdAt: new Date(Date.now() - 10 * DAY),
    },
  });
  made.push(shop.id);
  await prisma.call.create({
    data: { businessId: shop.id, callerPhone: "+15550107777", status: "ended", durationSec: 80, createdAt: new Date(Date.now() - 5 * DAY) },
  });
  await sendLifecycleEmails();
  assert.equal(to(shop.ownerEmail).filter((m) => /first call/.test(m.subject)).length, 0);
  const row = await prisma.lifecycleEmail.findUnique({ where: { dedupeKey: `first_call:${shop.id}` } });
  assert.equal(row?.status, "skipped");
});
