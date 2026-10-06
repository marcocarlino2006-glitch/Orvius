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

test("6. lost-call recovery covers every shop in one run, at 3,000 shops", { timeout: 180_000 }, async () => {
  const { recoverLostCallsAccountWide } = await import("../src/lib/line-watch.ts");
  const SHOPS = 3000;
  const tag = uid();
  const rows = Array.from({ length: SHOPS }, (_, i) => ({
    name: `Sweep ${i}`,
    slug: `sweep-${tag}-${i}`,
    environment: "test",
    trade: "HVAC",
    ownerEmail: `sweep-${tag}-${i}@example.test`,
    ownerPhone: "+13035550199",
    vapiAssistantId: `asst_${tag}_${String(i).padStart(4, "0")}`,
  }));
  await prisma.business.createMany({ data: rows });
  const shops = await prisma.business.findMany({ where: { slug: { startsWith: `sweep-${tag}-` } }, select: { id: true, vapiAssistantId: true } });
  made.push(...shops.map((s) => s.id));

  const now = new Date();
  const at = (min) => new Date(now.getTime() - min * 60_000).toISOString();
  // 1,000 calls in the last two hours across the account, all saved but three.
  const calls = Array.from({ length: 1000 }, (_, i) => ({
    id: `vc_${tag}_${i}`,
    assistantId: `asst_${tag}_${String((i * 7) % SHOPS).padStart(4, "0")}`,
    type: "inboundPhoneCall",
    status: "ended",
    createdAt: at(110 - i * 0.09),
    startedAt: at(110 - i * 0.09),
    endedAt: at(108 - i * 0.09),
    customer: { number: `+1312555${String(1000 + (i % 9000)).padStart(4, "0")}` },
    analysis: { summary: "No heat.", structuredData: { name: "Caller", serviceType: "No heat", urgency: "same-day" } },
  }));
  const lostIdx = [3, 500, 997];
  calls[3].assistantId = `asst_${tag}_0001`;
  calls[500].assistantId = `asst_${tag}_2999`;
  calls[997].assistantId = `asst_${tag}_1500`;
  const byAssistant = new Map(shops.map((s) => [s.vapiAssistantId, s.id]));
  await prisma.call.createMany({
    data: calls.filter((_, i) => !lostIdx.includes(i)).map((c) => ({ businessId: byAssistant.get(c.assistantId), vapiCallId: c.id, status: "ended" })),
  });

  const newestFirst = [...calls].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let pagesServed = 0;
  const list = async ({ since, before, limit }) => {
    pagesServed += 1;
    return newestFirst.filter((c) => c.createdAt > since.toISOString() && (!before || c.createdAt < before)).slice(0, limit);
  };

  const result = await recoverLostCallsAccountWide({ now, list });
  assert.equal(result.checked, 1000);
  assert.equal(pagesServed, 11, "ten pages of 100, then the empty page that ends the walk");
  assert.deepEqual(result.recovered.sort(), lostIdx.map((i) => calls[i].id).sort());
  for (const [i, shopNo] of [[3, "0001"], [500, "2999"], [997, "1500"]]) {
    const saved = await prisma.call.findUnique({ where: { vapiCallId: calls[i].id } });
    assert.equal(saved.businessId, byAssistant.get(`asst_${tag}_${shopNo}`), "recovered into the right shop");
  }
  assert.equal(result.truncated, false);

  const again = await recoverLostCallsAccountWide({ now, list });
  assert.deepEqual(again.recovered, [], "a second pass changes nothing");
});

test("7. a late GitHub schedule is caught: sweeps stamp their runs, the status probe says late, and live traffic makes up a missed line watch exactly once", async () => {
  const runs = await import("../src/lib/cron-runs.ts");
  const backstop = await import("../src/lib/cron-backstop.ts");
  const { GET: status } = await import("../src/app/api/status/route.ts");
  await prisma.cronRun.deleteMany({});

  const now = new Date();
  assert.deepEqual((await runs.lateCrons(now)).sort(), ["alert-drain", "line-watch"], "never ran is late");
  assert.equal((await (await status()).json()).sweeps, "late");

  await runs.markCronRan("alert-drain", now);
  await runs.markCronRan("line-watch", now);
  assert.deepEqual(await runs.lateCrons(now), []);
  assert.equal((await (await status()).json()).sweeps, "on_time");

  // GitHub stopped firing line-watch two hours ago.
  await prisma.cronRun.update({ where: { name: "line-watch" }, data: { lastRunAt: new Date(now.getTime() - 2 * 3600_000) } });
  assert.deepEqual(await runs.lateCrons(now), ["line-watch"]);
  const claims = await Promise.all(Array.from({ length: 8 }, () => runs.claimLateCron("line-watch", now)));
  assert.equal(claims.filter(Boolean).length, 1, "eight requests notice; one runs it");

  await prisma.cronRun.update({ where: { name: "line-watch" }, data: { lastRunAt: new Date(now.getTime() - 2 * 3600_000), lastClaimAt: null } });
  backstop.resetBackstopThrottleForTests();
  const madeUp = await backstop.backstopLateSweeps("test", now);
  assert.ok(madeUp, "the made-up run happened");
  const row = await prisma.cronRun.findUnique({ where: { name: "line-watch" } });
  assert.ok(now.getTime() - row.lastRunAt.getTime() < 60_000, "and it stamped itself");
  assert.equal(await backstop.backstopLateSweeps("test", now), null, "throttled: the next request doesn't look again");
});

test("19. cron routes refuse unsigned requests against a live database, not only in production", async () => {
  const saved = { db: process.env.DATABASE_URL, secret: process.env.CRON_SECRET };
  process.env.DATABASE_URL = "libsql://orvius-prod.turso.io";
  delete process.env.CRON_SECRET;
  try {
    const { NextRequest } = await import("next/server");
    for (const name of ["line-watch", "notifications", "alert-drain"]) {
      const { GET } = await import(`../src/app/api/cron/${name}/route.ts`);
      const res = await GET(new NextRequest(`http://localhost/api/cron/${name}`));
      assert.equal(res.status, 503, `${name} must not run unsigned against Turso`);
    }
  } finally {
    process.env.DATABASE_URL = saved.db;
    if (saved.secret) process.env.CRON_SECRET = saved.secret;
  }
});

test("8. the daily sweep runs money first, stops at its deadline instead of being killed, and its shop loops wrap from a random start", async () => {
  const { forEachShop } = await import("../src/lib/for-each-shop.ts");
  const tag = uid();
  await prisma.business.createMany({
    data: Array.from({ length: 250 }, (_, i) => ({ name: `Loop ${i}`, slug: `loop-${tag}-${i}`, environment: "test", ownerEmail: `loop-${tag}-${i}@example.test` })),
  });
  const ids = (await prisma.business.findMany({ where: { slug: { startsWith: `loop-${tag}-` } }, select: { id: true } })).map((s) => s.id);
  made.push(...ids);
  const where = { slug: { startsWith: `loop-${tag}-` } };

  for (let run = 0; run < 3; run++) {
    const seen = [];
    assert.equal(await forEachShop(where, () => false, async (shop) => void seen.push(shop.id)), true);
    assert.equal(seen.length, 250);
    assert.equal(new Set(seen).size, 250, "every shop exactly once, wherever it started");
  }
  const starts = new Set();
  for (let run = 0; run < 6; run++) {
    let first = null;
    await forEachShop(where, () => first !== null, async (shop) => void (first ??= shop.id));
    starts.add(first);
  }
  assert.ok(starts.size > 1, "a cut-off day starts somewhere new tomorrow");
  let n = 0;
  assert.equal(await forEachShop(where, () => n >= 40, async () => void n++), false, "reports that it stopped early");

  const route = readFileSync(new URL("../src/app/api/cron/notifications/route.ts", import.meta.url), "utf8");
  assert.match(route, /export const maxDuration = 60;/);
  assert.ok(route.indexOf('"overage_billing"') < route.indexOf("autopilot: true"), "billing runs before the per-shop loops");
  assert.ok(route.indexOf('"lapsed_lines"') < route.indexOf("vapiAssistantId: { not: null }"));
});

test("9/10. a platform-wide failure pages the founder once per quarter hour: Vapi down or out of credit, database gone, Twilio account blocked", async () => {
  const pager = await import("../src/lib/platform-pager.ts");
  assert.ok(pager.isVapiBillingRefusal("call.start.error-subscription-insufficient-credits"));
  assert.ok(pager.isVapiBillingRefusal("call.start.error-subscription-frozen"));
  assert.ok(!pager.isVapiBillingRefusal("customer-ended-call"));
  assert.ok(!pager.isVapiBillingRefusal(null));
  assert.ok(pager.isTwilioAccountFailure({ code: 30002 }), "account suspended");
  assert.ok(pager.isTwilioAccountFailure({ code: 20003 }), "bad credentials");
  assert.ok(!pager.isTwilioAccountFailure({ code: 21610 }), "one customer's STOP is not a platform failure");

  await prisma.cronRun.deleteMany({ where: { name: { startsWith: "page:" } } });
  const now = new Date();
  assert.equal((await pager.pagePlatform("vapi_billing", {}, now)).paged, true);
  assert.equal((await pager.pagePlatform("vapi_billing", {}, new Date(now.getTime() + 60_000))).paged, false, "a burst of refused calls is one page");
  assert.equal((await pager.pagePlatform("vapi_billing", {}, new Date(now.getTime() + 16 * 60_000))).paged, true, "still broken a quarter hour later pages again");
  assert.equal((await pager.pagePlatform("twilio_account", {}, now)).paged, true, "kinds page independently");

  // The voice fallback answering a call is itself the page that Vapi is down.
  const { POST } = await import("../src/app/api/webhooks/twilio/voice-fallback/route.ts");
  await prisma.cronRun.deleteMany({ where: { name: "page:vapi_unreachable" } });
  const line = `+1720559${String(Math.floor(Math.random() * 9000) + 1000)}`;
  await makeShop({ twilioPhone: line });
  deferred.length = 0;
  await POST(twilioForm({ From: "+13035550111", To: line, CallSid: `CA${uid()}` }));
  for (const task of deferred.splice(0)) await task();
  assert.ok(await prisma.cronRun.findUnique({ where: { name: "page:vapi_unreachable" } }), "fallback call paged the founder");
});

test("11. an owner no channel can reach is escalated to the founder, once per shop per day", async () => {
  const { applySmsDeliveryReceipt } = await import("../src/lib/notification-queue.ts");
  const shop = await makeShop({ name: "Landline Plumbing", ownerPhone: "+13035550144", ownerEmail: null });
  const sid = `SM${uid()}`;
  const row = await prisma.ownerNotification.create({
    data: { businessId: shop.id, channel: "sms", dedupeKey: `t:${uid()}`, status: "sent", deliveryId: sid, attempts: 1, ownerPhone: shop.ownerPhone, businessName: shop.name, message: "Missed call" },
  });
  // 30006: landline or unreachable carrier — a verdict, and no email to fall back to.
  await applySmsDeliveryReceipt({ messageSid: sid, messageStatus: "undelivered", errorCode: "30006" });
  assert.equal((await prisma.ownerNotification.findUnique({ where: { id: row.id } })).status, "failed");
  const day = new Date().toISOString().slice(0, 10);
  assert.ok(await prisma.cronRun.findUnique({ where: { name: `page:owner_unreachable:${shop.id}:${day}` } }), "founder paged");

  const { pageOwnerUnreachable } = await import("../src/lib/platform-pager.ts");
  assert.equal((await pageOwnerUnreachable(shop.id, "sms")).paged, false, "once a day per shop");
});

test("15. retention keeps up at scale: expired call content drains past one batch without looping on failures, old logs are pruned, once-per-shop alerts stay", async () => {
  const { purgeExpiredCallContent, pruneOperationalLogs } = await import("../src/lib/retention.ts");
  const shop = await makeShop();
  const now = new Date();
  const old = new Date(now.getTime() - 26 * 31 * 86_400_000);

  await prisma.call.createMany({
    data: Array.from({ length: 450 }, (_, i) => ({
      businessId: shop.id,
      vapiCallId: `ret-${shop.id}-${i}`,
      transcript: "old words",
      createdAt: new Date(old.getTime() + i * 1000),
    })),
  });
  let vapiDeletes = 0;
  const result = await purgeExpiredCallContent({
    now,
    deleteTwilio: null,
    deleteVapi: async (id) => {
      vapiDeletes += 1;
      if (id.endsWith("-7")) throw new Error("Vapi 503");
      return "deleted";
    },
  });
  const left = await prisma.call.findMany({ where: { businessId: shop.id, contentPurgedAt: null }, select: { vapiCallId: true, transcript: true } });
  assert.deepEqual(left.map((c) => c.vapiCallId), [`ret-${shop.id}-7`], "only the call Vapi refused waits for tomorrow");
  assert.equal(left[0].transcript, null, "our copy is gone even while Vapi's is pending");
  assert.ok(vapiDeletes >= 450 && vapiDeletes < 900, `each call tried once per run, got ${vapiDeletes}`);
  assert.ok(result.purged >= 449);

  const ago = (days) => new Date(now.getTime() - days * 86_400_000);
  const hook = (externalId, createdAt) =>
    prisma.webhookEvent.create({ data: { source: "test", externalId, eventType: "t", status: "processed", businessId: shop.id, createdAt } });
  const oldHook = await hook(`old-${uid()}`, ago(91));
  const freshHook = await hook(`new-${uid()}`, ago(89));
  const alert = (dedupeKey, status, createdAt) =>
    prisma.ownerNotification.create({ data: { businessId: shop.id, channel: "sms", dedupeKey, status, createdAt } });
  const oldSent = await alert(`call:${uid()}`, "sent", ago(181));
  const oldSkipped = await alert(`call:${uid()}`, "skipped", ago(181));
  const oldPending = await alert(`call:${uid()}`, "pending", ago(181));
  const setupNudge = await alert(`setup:forward:${shop.id}`, "sent", ago(400));
  const testAlert = await alert(`test-alert:${uid()}`, "sent", ago(400));
  const recentSent = await alert(`call:${uid()}`, "sent", ago(170));

  const pruned = await pruneOperationalLogs({ now });
  assert.equal(pruned.finished, true);
  const hooks = await prisma.webhookEvent.findMany({ where: { id: { in: [oldHook.id, freshHook.id] } }, select: { id: true } });
  assert.deepEqual(hooks.map((h) => h.id), [freshHook.id]);
  const alerts = await prisma.ownerNotification.findMany({ where: { businessId: shop.id }, select: { id: true } });
  assert.deepEqual(
    new Set(alerts.map((a) => a.id)),
    new Set([oldPending.id, setupNudge.id, testAlert.id, recentSent.id]),
    "finished alerts past 180 days go; undelivered ones and once-per-shop keys stay",
  );
  assert.ok(![oldSent.id, oldSkipped.id].some((id) => alerts.some((a) => a.id === id)));
});

test("17. the status probe says whether the database answers from the functions' region", async () => {
  const { GET } = await import("../src/app/api/status/route.ts");
  const near = await (await GET()).json();
  assert.equal(near.database, "near");

  const real = prisma.$queryRaw;
  prisma.$queryRaw = async () => {
    await new Promise((resolve) => setTimeout(resolve, 70));
    return [{ 1: 1 }];
  };
  try {
    const far = await (await GET()).json();
    assert.equal(far.database, "far");
  } finally {
    prisma.$queryRaw = real;
  }
  const workflow = readFileSync(new URL("../.github/workflows/uptime.yml", import.meta.url), "utf8");
  assert.match(workflow, /"database":"near"/);
});

test("18. public forms cannot pump texts: only US and Canadian mobiles are texted, one number caps out for the day, and a forged forwarding header is not a new address", async () => {
  const { isTextableNumber } = await import("../src/lib/sms-destination.ts");
  const { clientIp } = await import("../src/lib/rate-limit.ts");
  for (const ok of ["+15125550177", "(416) 555-0199", "+17875550100"]) assert.equal(isTextableNumber(ok), true, ok);
  for (const bad of ["+447700900123", "+18765550100", "+18095550100", "+19005550100", "+14115550100", "+15129765555", "+15120551234"]) {
    assert.equal(isTextableNumber(bad), false, bad);
  }

  const forged = new Request("http://localhost/", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "203.0.113.9" } });
  assert.equal(clientIp(forged), "203.0.113.9");
  assert.equal(clientIp(new Request("http://localhost/", { headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.4" } })), "198.51.100.4");

  const shop = await makeShop({ webChatOn: true, environment: "demo" });
  const { POST } = await import("../src/app/api/public/chat/[slug]/route.ts");
  const net = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  let n = 0;
  const chat = (phone) =>
    POST(
      new Request(`http://localhost/api/public/chat/${shop.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `${net}.${(n += 1)}` },
        body: JSON.stringify({ name: "Bot", phone, message: "hi" }),
      }),
      { params: Promise.resolve({ slug: shop.slug }) },
    );
  const tail = () => String(Math.floor(Math.random() * 9000) + 1000);
  const abroad = await chat(`+4477009${tail()}`);
  assert.equal(abroad.status, 400);
  assert.match((await abroad.json()).error, /US or Canadian/);
  const caribbean = await chat(`+1876555${tail()}`);
  assert.equal(caribbean.status, 400);

  const target = `+1512555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await chat(target)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429], "a fresh address per request still stops at four texts to one number");
  assert.equal(await prisma.lead.count({ where: { businessId: shop.id } }), 4);
});

test("20. a technician link closes on jobs never scheduled, a week after completion, and for the technician taken off the job", async () => {
  const { techLinkExpired } = await import("../src/lib/ensure-tech-token.ts");
  const { notifyTechOnAssign } = await import("../src/lib/notify-tech-assign.ts");
  const { GET } = await import("../src/app/api/public/tech/[token]/route.ts");
  const now = new Date();
  const days = (n) => new Date(now.getTime() + n * 86_400_000);
  assert.equal(techLinkExpired({ status: "new", scheduledAt: null, createdAt: days(-29) }, now), false);
  assert.equal(techLinkExpired({ status: "new", scheduledAt: null, createdAt: days(-31) }, now), true);
  assert.equal(techLinkExpired({ status: "completed", scheduledAt: days(2), completedAt: days(-8) }, now), true);

  const shop = await makeShop();
  const open = (token) =>
    GET(new Request(`http://localhost/api/public/tech/${token}`, { headers: { "x-real-ip": `192.0.2.${Math.floor(Math.random() * 200)}` } }), {
      params: Promise.resolve({ token }),
    });
  const stale = await prisma.job.create({
    data: { businessId: shop.id, title: "Never booked", status: "new", techToken: `tt-${uid()}`, createdAt: days(-40) },
  });
  assert.equal((await open(stale.techToken)).status, 410);

  const [first, second] = await Promise.all(
    ["First Tech", "Second Tech"].map((name) => prisma.technician.create({ data: { businessId: shop.id, name, phone: `+1512555${2000 + Math.floor(Math.random() * 7000)}` } })),
  );
  const job = await prisma.job.create({
    data: { businessId: shop.id, title: "Furnace", status: "scheduled", scheduledAt: days(1), technicianId: first.id, techToken: `tt-${uid()}` },
  });
  assert.equal((await open(job.techToken)).status, 200);
  await prisma.job.update({ where: { id: job.id }, data: { technicianId: second.id } });
  const handed = await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: first.id, nextTechnicianId: second.id });
  assert.notEqual(handed.techToken, job.techToken);
  assert.equal((await open(job.techToken)).status, 404, "the first technician's link no longer opens the job");
  assert.equal((await open(handed.techToken)).status, 200);

  await prisma.job.update({ where: { id: job.id }, data: { technicianId: null } });
  await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: second.id, nextTechnicianId: null });
  assert.equal((await open(handed.techToken)).status, 404, "unassigning retires the link too");
});

test("21. no customer data on open links or in logs: voicemail plays only signed in, health keeps the line private, known-email probing stops, message routes fail closed, phones are masked", async () => {
  const { POST } = await import("../src/app/api/webhooks/twilio/voice-fallback/route.ts");
  const { GET: playVoicemail } = await import("../src/app/api/leads/[id]/voicemail/route.ts");
  const line = `+1720555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const shop = await makeShop({ name: "Private Air", twilioPhone: line, ownerPhone: "+13035550102" });
  const sid = `CA${uid()}`;
  const caller = `+1303555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const recording = `https://api.twilio.com/2010-04-01/Accounts/AC${"a".repeat(32)}/Recordings/RE${"b".repeat(32)}`;
  await POST(twilioForm({ From: caller, To: line, CallSid: sid, DialCallStatus: "no-answer" }));
  await POST(twilioForm({ From: caller, To: line, CallSid: sid, RecordingUrl: recording, RecordingDuration: "9" }));
  const lead = await prisma.lead.findFirst({ where: { businessId: shop.id, externalId: `voice-fallback:${sid}` } });
  const alerts = await prisma.ownerNotification.findMany({ where: { businessId: shop.id, leadId: lead.id } });
  const voicemailAlert = alerts.find((a) => /Voicemail from/.test(a.message ?? ""));
  assert.ok(voicemailAlert);
  assert.doesNotMatch(voicemailAlert.message, /api\.twilio\.com/, "the owner's text does not carry the open recording URL");
  assert.match(voicemailAlert.message, new RegExp(`/api/leads/${lead.id}/voicemail`));

  const ctx = { params: Promise.resolve({ id: lead.id }) };
  signedInAs = null;
  assert.equal((await playVoicemail(new Request("http://localhost/"), ctx)).status, 401);
  const other = await makeShop();
  signedInAs = other.ownerEmail;
  assert.equal((await playVoicemail(new Request("http://localhost/"), { params: Promise.resolve({ id: lead.id }) })).status, 404);
  signedInAs = shop.ownerEmail;
  const twilioEnv = { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN };
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "secret";
  const realFetch = globalThis.fetch;
  let fetched = null;
  globalThis.fetch = async (url, init) => {
    fetched = { url: String(url), auth: init?.headers?.Authorization };
    return new Response("ID3audio", { headers: { "content-type": "audio/mpeg" } });
  };
  try {
    const played = await playVoicemail(new Request("http://localhost/"), ctx);
    assert.equal(played.status, 200);
    assert.equal(played.headers.get("content-type"), "audio/mpeg");
    assert.equal(await played.text(), "ID3audio");
    assert.equal(fetched.url, `${recording}.mp3`);
    assert.match(fetched.auth, /^Basic /);
  } finally {
    globalThis.fetch = realFetch;
    signedInAs = null;
    for (const [key, value] of [["TWILIO_ACCOUNT_SID", twilioEnv.sid], ["TWILIO_AUTH_TOKEN", twilioEnv.token]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const { GET: health } = await import("../src/app/api/health/route.ts");
  const localUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "libsql://orvius-prod.turso.io";
  try {
    const shape = await (await health(new Request("http://localhost/api/health"))).json();
    assert.equal(shape.stats, undefined, "a preview on the live database publishes no counts");
    assert.equal(shape.twilioPhone, undefined);
    assert.equal(typeof shape.twilioLineConfigured, "boolean");
  } finally {
    process.env.DATABASE_URL = localUrl;
  }

  const { POST: signup } = await import("../src/app/api/auth/signup/route.ts");
  const known = `known-${uid()}@example.test`;
  await prisma.passwordLogin.create({ data: { email: known, passwordHash: "x" } });
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
  const probe = () =>
    signup(new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email: known, password: "a-long-enough-password-1" }),
    }));
  const codes = [];
  for (let i = 0; i < 5; i += 1) codes.push((await probe()).status);
  await prisma.passwordLogin.delete({ where: { email: known } });
  assert.deepEqual(codes, [409, 409, 409, 429, 429], "three honest answers, then a connection checking known addresses is refused");

  const { sharedRateLimit } = await import("../src/lib/rate-limit.ts");
  const raw = prisma.$queryRaw;
  prisma.$queryRaw = async () => {
    throw new Error("database unreachable");
  };
  try {
    assert.equal((await sharedRateLimit({ key: `k-${uid()}`, limit: 5, windowMs: 1000 })).ok, true, "reads fall back to memory");
    assert.equal((await sharedRateLimit({ key: `k-${uid()}`, limit: 5, windowMs: 1000, failClosed: true })).ok, false, "senders refuse");
  } finally {
    prisma.$queryRaw = raw;
  }

  const { redactPhones } = await import("../src/lib/logger.ts");
  assert.equal(redactPhones('{"from":"+15125550177","error":"Text to +447700900123 failed"}'), '{"from":"+1512•••0177","error":"Text to +4477••••0123 failed"}');
  const lines = [];
  const realWarn = console.warn;
  console.warn = (line) => lines.push(line);
  try {
    const { logWarn } = await import("../src/lib/logger.ts");
    logWarn("test.phone", { to: "+13035550199" });
  } finally {
    console.warn = realWarn;
  }
  assert.doesNotMatch(lines.join(""), /3035550199/);
});

test("22. the Vapi bill has a ceiling: a caller dialing on repeat and a runaway shop line are cut on connect, the owner's own phone never is", async () => {
  const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");
  const shop = await makeShop({ ownerPhone: "+13035550160", vapiAssistantId: `asst-${uid()}` });
  const realFetch = globalThis.fetch;
  const control = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://control.test/")) {
      control.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response("{}");
    }
    return realFetch(url, init);
  };
  const connect = async (caller) => {
    const id = `vc-${uid()}`;
    deferred.length = 0;
    const res = await POST(
      new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET ?? "" },
        body: JSON.stringify({
          message: {
            type: "status-update",
            status: "in-progress",
            call: { id, assistantId: shop.vapiAssistantId, customer: caller ? { number: caller } : undefined, monitor: { controlUrl: `https://control.test/${id}` } },
          },
        }),
      }),
    );
    assert.equal(res.status, 200);
    for (const task of deferred.splice(0)) await task().catch(() => {});
    return control.filter((c) => c.url.endsWith(id)).map((c) => c.body);
  };
  const ceiling = process.env.ORVIUS_SHOP_DAILY_CALL_CEILING;
  try {
    const robo = `+1720555${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const ago = (m) => new Date(Date.now() - m * 60_000);
    await prisma.call.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ businessId: shop.id, vapiCallId: `old-${uid()}-${i}`, callerPhone: robo, createdAt: ago(5 + i) })) });
    const cut = await connect(robo);
    assert.equal(cut.length, 1);
    assert.equal(cut[0].type, "say");
    assert.equal(cut[0].endCallAfterSpoken, true);
    assert.match(cut[0].content, /several calls from this number/);

    await prisma.call.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ businessId: shop.id, vapiCallId: `own-${uid()}-${i}`, callerPhone: "+13035550160", createdAt: ago(1 + i) })) });
    assert.deepEqual(await connect("+13035550160"), [], "the owner testing their own line is never cut");

    const fresh = `+1720556${String(Math.floor(Math.random() * 9000) + 1000)}`;
    assert.deepEqual(await connect(fresh), [], "a new caller on a normal day goes straight through");

    process.env.ORVIUS_SHOP_DAILY_CALL_CEILING = "20";
    await prisma.cronRun.deleteMany({ where: { name: "page:spend_ceiling" } });
    const flood = await connect(null);
    assert.equal(flood.length, 1, "past the shop's daily ceiling even a withheld number is cut");
    assert.match(flood[0].content, /unusual number of calls/);
    assert.ok(await prisma.cronRun.findUnique({ where: { name: "page:spend_ceiling" } }), "and the founder is paged");
  } finally {
    globalThis.fetch = realFetch;
    if (ceiling === undefined) delete process.env.ORVIUS_SHOP_DAILY_CALL_CEILING;
    else process.env.ORVIUS_SHOP_DAILY_CALL_CEILING = ceiling;
  }

  const { buildVapiAssistantConfig } = await import("../src/lib/vapi.ts");
  const config = buildVapiAssistantConfig({ businessName: "X", systemPrompt: "p", greeting: "g", webhookUrl: "https://x" });
  assert.equal(config.maxDurationSeconds, 600, "a stuck line stops billing at ten minutes");
  assert.equal(config.silenceTimeoutSeconds, 30);
});

test("23. a line stops answering three weeks into a failed payment or a week after an unpaid pilot, the owner is told, and paying turns it back on", async () => {
  const { suspendUnpaidLines } = await import("../src/lib/line-lifecycle.ts");
  const { syncSubscriptionToBusiness } = await import("../src/lib/billing-sync.ts");
  const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");
  const days = (n) => new Date(Date.now() + n * 86_400_000);
  const number = () => `+1720557${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const shopWith = (data) =>
    makeShop({ environment: "production", ownerPhone: "+13035550170", vapiAssistantId: `asst-${uid()}`, twilioPhone: number(), ...data });
  const longPastDue = await shopWith({ billingStatus: "past_due", pastDueSince: days(-22) });
  const freshPastDue = await shopWith({ billingStatus: "past_due", pastDueSince: days(-10) });
  const endedPilot = await shopWith({ billingStatus: "pilot", pilotEndsAt: days(-8), createdAt: days(-40) });
  const compedPilot = await shopWith({ billingStatus: "pilot", pilotEndsAt: days(365), createdAt: days(-400) });
  const paying = await shopWith({ billingStatus: "active", createdAt: days(-400) });
  const mine = [longPastDue, freshPastDue, endedPilot, compedPilot, paying];

  const env = { ...process.env };
  Object.assign(process.env, { VAPI_API_KEY: "vapi-test", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret" });
  const realFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.vapi.ai/")) return realFetch(url, init);
    if (u.includes("/phone-number?")) {
      return Response.json(u.includes("createdAtLt") ? [] : mine.map((s, i) => ({ id: `pn-${s.id}`, number: s.twilioPhone, createdAt: new Date(2026, 0, i + 1).toISOString() })));
    }
    if (init.method === "PATCH") patches.push({ url: u, body: JSON.parse(init.body) });
    return Response.json({});
  };
  try {
    const result = await suspendUnpaidLines(new Date());
    assert.ok(result.suspended >= 2);
    const state = Object.fromEntries(
      await Promise.all(mine.map(async (s) => [s.id, (await prisma.business.findUnique({ where: { id: s.id } })).lineSuspendedAt])),
    );
    assert.ok(state[longPastDue.id], "22 days past due: stopped");
    assert.ok(state[endedPilot.id], "pilot ended 8 days ago: stopped");
    assert.equal(state[freshPastDue.id], null, "10 days past due still answers while Stripe retries");
    assert.equal(state[compedPilot.id], null, "a comped shop with a far pilot end keeps answering");
    assert.equal(state[paying.id], null);
    assert.ok(patches.some((p) => p.url.endsWith(`pn-${longPastDue.id}`) && p.body.assistantId === null), "the assistant came off the number");
    const told = await prisma.ownerNotification.findFirst({ where: { businessId: longPastDue.id, dedupeKey: { startsWith: "billing:line_suspended:" } } });
    assert.match(told.message, /stopped answering because the card payment has failed/);

    const ask = async (shop) =>
      (await POST(new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET ?? "" },
        body: JSON.stringify({ message: { type: "assistant-request", call: { id: `ar-${uid()}`, phoneNumber: { number: shop.twilioPhone }, customer: { number: "+13035550199" } } } }),
      }))).json();
    assert.match((await ask(longPastDue)).error, /isn't taking calls right now/, "the routed number does not hand back the assistant");
    assert.equal((await ask(compedPilot)).assistantId, compedPilot.vapiAssistantId);

    patches.length = 0;
    await syncSubscriptionToBusiness({
      id: `sub_${uid()}`,
      status: "active",
      customer: `cus_${uid()}`,
      metadata: { businessId: longPastDue.id },
      items: { data: [] },
    });
    const resumed = await prisma.business.findUnique({ where: { id: longPastDue.id } });
    assert.equal(resumed.billingStatus, "active");
    assert.equal(resumed.lineSuspendedAt, null, "paying turns the line back on");
    assert.ok(patches.some((p) => p.body.assistantId === longPastDue.vapiAssistantId));
  } finally {
    globalThis.fetch = realFetch;
    for (const key of ["VAPI_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
});

test("24. lapsed numbers are released by default after a week's notice, suspended-for-non-payment lines included", async () => {
  const { releaseLapsedLines } = await import("../src/lib/line-lifecycle.ts");
  const prev = process.env.ORVIUS_RELEASE_LAPSED_LINES;
  delete process.env.ORVIUS_RELEASE_LAPSED_LINES;
  const days = (n) => new Date(Date.now() + n * 86_400_000);
  const number = () => `+1720558${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const soon = await makeShop({ environment: "production", billingStatus: "canceled", canceledAt: days(-25), twilioPhone: number() });
  const suspended = await makeShop({ environment: "production", billingStatus: "pilot", lineSuspendedAt: days(-31), twilioPhone: number() });
  const fresh = await makeShop({ environment: "production", billingStatus: "canceled", canceledAt: days(-5), twilioPhone: number() });
  const found = [];
  const findMany = prisma.business.findMany;
  prisma.business.findMany = async (args) => {
    const rows = await findMany.call(prisma.business, args);
    found.push(rows.map((r) => r.id));
    return rows;
  };
  try {
    const result = await releaseLapsedLines();
    assert.equal(result.mode, "live", "release is on without anyone setting a variable");
    const [noticed, due] = found;
    assert.ok(noticed.includes(soon.id) && !noticed.includes(fresh.id), "25 days canceled gets the week's notice");
    assert.ok(due.includes(suspended.id), "a line suspended for non-payment 31 days ago is due for release");
    assert.ok(!due.includes(soon.id) && !due.includes(fresh.id));
    const notice = await prisma.ownerNotification.findFirst({ where: { businessId: soon.id, dedupeKey: { startsWith: "billing:line_release_notice:" } } });
    assert.match(notice.message, /goes back to the carrier in about 7 days/);
  } finally {
    prisma.business.findMany = findMany;
    if (prev === undefined) delete process.env.ORVIUS_RELEASE_LAPSED_LINES;
    else process.env.ORVIUS_RELEASE_LAPSED_LINES = prev;
  }
});

test("25/26. the meter, the usage texts and the overage invoice count the same billable calls: no owner tests, hang-ups or spam", async () => {
  const { countBillableCalls } = await import("../src/lib/billable-calls.ts");
  const shop = await makeShop({ ownerPhone: "+13035550180", transferPhone: "(303) 555-0181" });
  const since = new Date(Date.now() - 86_400_000);
  const call = (data) => prisma.call.create({ data: { businessId: shop.id, vapiCallId: `bill-${uid()}`, direction: "inbound", ...data } });
  await call({ callerPhone: "+17205550101", durationSec: 95 });
  await call({ callerPhone: "+17205550102", durationSec: null });
  await call({ callerPhone: null, durationSec: 40 });
  await call({ callerPhone: "+13035550180", durationSec: 120 });
  await call({ callerPhone: "+13035550181", durationSec: 60 });
  await call({ callerPhone: "+17205550103", durationSec: 8 });
  await call({ callerPhone: "+17205550104", durationSec: 30, direction: "outbound" });
  const spam = await call({ callerPhone: "+17205550105", durationSec: 45 });
  await prisma.lead.create({ data: { businessId: shop.id, callId: spam.id, phone: "+17205550105", status: "spam" } });
  const real = await call({ callerPhone: "+17205550106", durationSec: 45 });
  await prisma.lead.create({ data: { businessId: shop.id, callId: real.id, phone: "+17205550106", status: "booked" } });

  assert.equal(await countBillableCalls(shop, { gte: since }), 4, "customer, unknown length, withheld number, and the booked caller");

  for (const file of ["src/lib/overage-billing.ts", "src/lib/owner-nudges.ts", "src/app/api/account/route.ts"]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /countBillableCalls\(/, `${file} meters through the billable count`);
  }
});

test("27. Orvius's own plan and overage collect sales tax once Stripe Tax is switched on", async () => {
  const { checkoutTaxParams } = await import("../src/lib/stripe.ts");
  const prev = process.env.STRIPE_AUTOMATIC_TAX;
  try {
    delete process.env.STRIPE_AUTOMATIC_TAX;
    assert.deepEqual(checkoutTaxParams(false), { billing_address_collection: "auto" }, "off until registrations exist");
    process.env.STRIPE_AUTOMATIC_TAX = "1";
    const fresh = checkoutTaxParams(false);
    assert.deepEqual(fresh.automatic_tax, { enabled: true });
    assert.equal(fresh.billing_address_collection, "required");
    assert.equal(fresh.customer_update, undefined, "Stripe refuses customer_update without a customer");
    assert.deepEqual(checkoutTaxParams(true).customer_update, { address: "auto", name: "auto" });
  } finally {
    if (prev === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
    else process.env.STRIPE_AUTOMATIC_TAX = prev;
  }
  assert.match(readFileSync(new URL("../src/app/api/billing/checkout/route.ts", import.meta.url), "utf8"), /\.\.\.checkoutTaxParams\(/);
  assert.match(readFileSync(new URL("../src/lib/overage-billing.ts", import.meta.url), "utf8"), /isAutomaticTaxEnabled\(\) \? \{ automatic_tax: \{ enabled: true \} \}/);
});

test("30. pricing shows the per-call price, and the payback line uses the entry plan, not the featured one", async () => {
  const { getPlanById, perCallCents } = await import("../src/lib/pricing-plans.ts");
  const line = getPlanById("line");
  assert.equal(perCallCents(line, "month"), Math.round((line.price * 100) / line.includedCalls));
  assert.equal(perCallCents(line, "year"), Math.round((line.annualPrice * 100) / line.includedCalls));
  assert.equal(perCallCents(getPlanById("pilot"), "month"), null);
  assert.equal(perCallCents(getPlanById("multi"), "month"), null);
  const page = readFileSync(new URL("../src/app/pricing/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /getFeaturedPlan/);
  assert.match(page, /perCallCents\(entry, "month"\)/);
  assert.match(readFileSync(new URL("../src/components/pricing-plan-card.tsx", import.meta.url), "utf8"), /perCallCents\(plan, interval\)/);
});

test("31. with card signup closed, a would-be shop lands on the waitlist instead of a dead end", async () => {
  const prevSignup = process.env.ORVIUS_SELF_SERVE_SIGNUP;
  const prevAllowed = process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
  process.env.ORVIUS_SELF_SERVE_SIGNUP = "0";
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = "";
  const email = `closed-${Date.now()}@example.test`;
  signedInAs = email;
  try {
    const { POST } = await import("../src/app/api/onboarding/route.ts");
    const req = () => new Request("http://localhost/api/onboarding", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-real-ip": `10.31.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const res = await POST(req());
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /on the list/);
    await POST(req());
    const rows = await prisma.waitlistEntry.findMany({ where: { email } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].plan, "self-serve");
  } finally {
    signedInAs = null;
    await prisma.waitlistEntry.deleteMany({ where: { email } });
    if (prevSignup === undefined) delete process.env.ORVIUS_SELF_SERVE_SIGNUP;
    else process.env.ORVIUS_SELF_SERVE_SIGNUP = prevSignup;
    if (prevAllowed === undefined) delete process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
    else process.env.ORVIUS_AUTH_ALLOWED_EMAILS = prevAllowed;
  }
});
