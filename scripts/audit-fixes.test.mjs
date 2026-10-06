#!/usr/bin/env node
/*
 * The scale audit, item by item: each test pins one way the business could
 * have failed at scale — a takeover, a silent line, a cost leak — so it stays
 * fixed.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { readFileSync } from "node:fs";

delete process.env.RESEND_API_KEY;

const nextServer = await import("next/server");
const deferred = [];
mock.module("next/server", {
  namedExports: { ...nextServer, after: (task) => deferred.push(task) },
});

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: `Audit ${uid()}`,
      slug: `audit-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("1. a manager cannot take the shop by changing the owner email; the owner still can", async () => {
  const { PATCH } = await import("../src/app/api/account/route.ts");
  const shop = await makeShop();
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });

  signedInAs = manager;
  const takeover = await PATCH(patch({ ownerEmail: manager }));
  assert.equal(takeover.status, 403);
  assert.match((await takeover.json()).error, /owns the shop/);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, shop.ownerEmail);

  // The settings form sends the unchanged owner email on every save; that must keep working for managers.
  const save = await PATCH(patch({ ownerEmail: shop.ownerEmail.toUpperCase(), name: "Renamed by manager" }));
  assert.equal(save.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).name, "Renamed by manager");

  signedInAs = shop.ownerEmail;
  const next = `new-owner-${uid()}@example.test`;
  const transfer = await PATCH(patch({ ownerEmail: next }));
  assert.equal(transfer.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, next);
  signedInAs = null;
});

function twilioForm(fields) {
  const form = new URLSearchParams(fields);
  return new Request("http://localhost/api/webhooks/twilio/voice-fallback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

test("2. AI down: the owner's phone rings live first, voicemail if nobody answers, and a database outage still gets the recorder", async () => {
  const { POST } = await import("../src/app/api/webhooks/twilio/voice-fallback/route.ts");
  const line = `+1720555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const shop = await makeShop({ name: "Fallback Air", twilioPhone: line, ownerPhone: "+13035550101" });
  const sid = `CA${uid()}`;
  const caller = `+1303555${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const first = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid }))).text();
  assert.match(first, /<Dial [^>]*timeout="18"/);
  assert.match(first, /<Number>\+13035550101<\/Number>/);
  const lead = await prisma.lead.findFirst({ where: { businessId: shop.id, externalId: `voice-fallback:${sid}` } });
  assert.ok(lead, "the missed call is a lead before anyone answers");
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: lead.id } });
  assert.match(alert.message, /ringing your phone now/);

  const noAnswer = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, DialCallStatus: "no-answer" }))).text();
  assert.match(noAnswer, /<Record /);
  assert.match(noAnswer, /Thanks for calling Fallback Air/);

  const answered = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, DialCallStatus: "completed" }))).text();
  assert.match(answered, /<Hangup \/>/);
  assert.match((await prisma.lead.findUnique({ where: { id: lead.id } })).notes, /answered live/);

  // The owner's phone bounced the ring back to this line: straight to the recorder, no second ring.
  const bounced = await (await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}`, ForwardedFrom: "+13035550101" }))).text();
  assert.doesNotMatch(bounced, /<Dial/);
  assert.match(bounced, /<Record /);
  const bouncedNoHeader = await (await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}` }))).text();
  assert.doesNotMatch(bouncedNoHeader, /<Dial/, "a repeat within two minutes is a bounce even without ForwardedFrom");

  const findMany = prisma.business.findMany;
  prisma.business.findMany = async () => {
    throw new Error("SQLITE_BUSY: database is locked");
  };
  try {
    const dbDown = await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}` }));
    assert.equal(dbDown.status, 200);
    const twiml = await dbDown.text();
    assert.match(twiml, /Thanks for calling\. We can&apos;t take your call live/);
    assert.match(twiml, /<Record /);
    const recDown = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, RecordingUrl: "https://api.twilio.com/rec/RE1", RecordingDuration: "12" }))).text();
    assert.match(recDown, /we&apos;ve got your message/);
  } finally {
    prisma.business.findMany = findMany;
  }
});

test("3. no new dental or medical shop: patient calls need a HIPAA agreement Orvius doesn't have", async () => {
  const trades = await import("../src/lib/trades.ts");
  assert.ok(!trades.OFFERED_TRADES.includes("Dental office"));
  assert.ok(!trades.OFFERED_TRADES.includes("Medical office"));
  assert.ok(trades.OFFERED_TRADES.includes("HVAC"));

  const { NextRequest } = await import("next/server");
  const { POST: checkout } = await import("../src/app/api/billing/checkout/route.ts");
  const res = await checkout(
    new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "line",
        shop: { name: "Bright Smile Dental", trade: "Dental office", ownerPhone: "+13035550188", acceptedTerms: true, acceptedSms: true },
      }),
    }),
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "trade_not_offered");

  // A shop already on a health trade keeps it; nobody new can switch into one.
  const { PATCH } = await import("../src/app/api/account/route.ts");
  const legacy = await makeShop({ trade: "Dental office" });
  signedInAs = legacy.ownerEmail;
  assert.equal((await PATCH(patch({ trade: "Dental office", name: "Still a dentist" }))).status, 200);
  const hvac = await makeShop();
  signedInAs = hvac.ownerEmail;
  assert.equal((await PATCH(patch({ trade: "Medical office" }))).status, 400);
  signedInAs = null;

  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.doesNotMatch(read("src/components/home-features.tsx"), /Dental and medical/);
  assert.doesNotMatch(read("src/components/home-demos.tsx"), /Dental/);
});

test("4. promotional texts need a written yes: JOIN or the booking-page box opts in, STOP opts out, and win-back skips everyone else", async () => {
  const { POST: sms } = await import("../src/app/api/webhooks/twilio/sms/route.ts");
  const { winBackAudience } = await import("../src/lib/win-back.ts");
  const line = `+1720556${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const shop = await makeShop({ name: "Join Air", twilioPhone: line, ownerPhone: "+13035550102" });
  const phone = `+1303556${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const smsForm = (Body) => {
    const r = twilioForm({ From: phone, To: line, Body, MessageSid: `SM${uid()}` });
    return new (nextServer.NextRequest)(r.url, { method: "POST", headers: r.headers, body: r.body, duplex: "half" });
  };

  const old = new Date(Date.now() - 200 * 86_400_000);
  const c = await prisma.customer.create({ data: { businessId: shop.id, name: "Ann Cole", phone, phoneNormalized: phone, lastSeenAt: old } });
  await prisma.job.create({ data: { businessId: shop.id, customerId: c.id, title: "Tune-up", status: "completed", completedAt: old } });
  assert.equal((await winBackAudience(shop.id, 3)).length, 0, "a past customer who never said yes gets no win-back");

  const joined = await (await sms(smsForm("Join"))).text();
  assert.match(joined, /you&apos;re in for occasional reminders and offers/);
  const after = await prisma.customer.findUnique({ where: { id: c.id } });
  assert.ok(after.marketingOptInAt);
  assert.equal(after.marketingOptInSource, "sms_join");
  assert.equal((await winBackAudience(shop.id, 3)).length, 1);

  await sms(smsForm("STOP"));
  assert.equal((await prisma.customer.findUnique({ where: { id: c.id } })).marketingOptInAt, null, "STOP ends promotional consent too");

  const { bookableShop, bookingSlots, bookOnline } = await import("../src/lib/online-booking.ts");
  const allDay = JSON.stringify(Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "00:00", close: "23:59" }])));
  const booking = await makeShop({ environment: "live", bookingPageOn: true, hoursJson: allDay, servicesJson: JSON.stringify([{ name: "Tune-up", durationMin: 60 }]) });
  const live = await bookableShop(booking.slug);
  const slots = await bookingSlots(live, "Tune-up");
  const [first, second] = [slots[0], slots.at(-1)];
  const yes = `+1303557${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const no = `+1303558${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const ticked = await bookOnline(live, { serviceType: "Tune-up", at: first.at, name: "Box Ticked", phone: yes, marketingOptIn: true });
  assert.equal(ticked.ok, true, JSON.stringify(ticked));
  const left = await bookOnline(live, { serviceType: "Tune-up", at: second.at, name: "Box Left", phone: no });
  assert.equal(left.ok, true, JSON.stringify(left));
  const byPhone = async (p) => prisma.customer.findFirst({ where: { businessId: booking.id, phoneNormalized: p } });
  assert.equal((await byPhone(yes)).marketingOptInSource, "booking_page");
  assert.equal((await byPhone(no)).marketingOptInAt, null);

  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/app/b/[slug]/page.tsx"), /marketingOptIn: false/, "the box starts unticked");
  assert.match(read("src/app/sms-terms/page.tsx"), /only to\s+customers who opted in/);
  assert.doesNotMatch(read("src/app/sms-terms/page.tsx"), /No marketing messages are sent/);
});

test("5. a caller's details go to another shop only on their own yes, and the privacy policy says so", async () => {
  const { isClearYes } = await import("../src/lib/in-call-tool-defs.ts");
  for (const yes of ["Yes", "yeah go ahead", "Sure, that's fine", "okay please", "Sí, por favor"]) assert.ok(isClearYes(yes), yes);
  for (const no of ["", "no", "No thanks", "I'd rather not", "I'll wait for you guys", "don't share my number", "hmm"]) assert.ok(!isClearYes(no), no);

  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const privacy = read("src/app/privacy/page.tsx");
  assert.match(privacy, /Orvius Network, at the caller&apos;s request/);
  assert.match(privacy, /referral credit/);
});
