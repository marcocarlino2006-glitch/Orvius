#!/usr/bin/env node
/*
 * The inbound call path keeps its promises: emergencies reach a person rather
 * than a slot, everyday emergency phrasing is recognised, the caller is never
 * told the owner was texted when no text went out, a stuck claim is retried,
 * and a late status event can't make a finished call look live.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import { classifyRequest } from "../src/lib/trade-playbooks.ts";
import { safetyAlertReply } from "../src/lib/in-call-tool-defs.ts";
import { ownerAlertContextLine } from "../src/lib/owner-alert-message.ts";
import { claimWebhookEvent } from "../src/lib/webhook-events.ts";
import { looksLikeSalesSolicitation } from "../src/lib/job-taxonomy.ts";
import { prisma } from "../src/lib/prisma.ts";

const read = (path) => readFileSync(path, "utf8");
const tag = `cp-${Date.now()}`;

after(async () => {
  await prisma.webhookEvent.deleteMany({ where: { externalId: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("everyday emergency phrasing is an emergency; routine calls are not", () => {
  const urgency = (trade, text) => classifyRequest({ business: { trade }, serviceType: text }).urgency;
  for (const [trade, text] of [
    ["HVAC", "furnace isn't working and it's freezing in here"],
    ["HVAC", "Our heater isn't working, it's freezing and we have a newborn"],
    ["HVAC", "furnace doesn't work, house is freezing, my elderly mom lives here"],
    ["HVAC", "my basement is flooding from the water heater"],
    ["Electrical", "basement is flooding near the panel"],
    ["Plumbing", "pipe burst, water everywhere"],
  ]) {
    assert.equal(urgency(trade, text), "emergency", `${trade}: ${text}`);
  }
  for (const [trade, text] of [
    ["HVAC", "need a tune-up next week"],
    ["HVAC", "AC isn't working, can someone come tomorrow"],
    ["HVAC", "water heater isn't working"],
    ["Plumbing", "toilet keeps running"],
  ]) {
    assert.notEqual(urgency(trade, text), "emergency", `${trade}: ${text}`);
  }
});

test("an emergency is never booked after the call, and the owner is told to call now", () => {
  const autoJob = read("src/lib/auto-job.ts");
  const escalate = autoJob.indexOf('if (urgency === "emergency")');
  assert.ok(escalate > 0 && escalate < autoJob.indexOf("createJobFromLead({"), "the emergency stop runs before any booking");
  assert.match(autoJob.slice(escalate, escalate + 600), /skipReason: "emergency_escalation"/);
  assert.equal(ownerAlertContextLine({ skipReason: "emergency_escalation", timezone: "America/Chicago" }), "Call them now · not booked");
});

test("the caller hears the owner was texted only when a text went out", () => {
  assert.match(safetyAlertReply({ texted: true, reached: true, transferring: false }), /^The owner has been texted\./);
  assert.match(safetyAlertReply({ texted: false, reached: true, transferring: false }), /^The owner has been alerted\./);
  const none = safetyAlertReply({ texted: false, reached: false, transferring: false });
  assert.doesNotMatch(none, /has been (texted|alerted)\./);
  assert.match(none, /Do not say the team was alerted/);
  assert.match(none, /911/);
  assert.doesNotMatch(safetyAlertReply({ texted: false, reached: false, transferring: true }), /has been/);
  const tools = read("src/lib/in-call-tools.ts");
  assert.match(tools, /processNotificationQueue\(5, \{ businessId: shop\.id \}\)/, "the shop's safety text sends before the global drain");
  assert.doesNotMatch(tools, /texted: canReach/);
});

test("a claim left in processing by a dead worker is retaken once, by one worker", async () => {
  const key = { source: "vapi", externalId: `${tag}-stuck`, eventType: "end-of-call-report" };
  await prisma.webhookEvent.create({ data: { ...key, status: "processing", claimedAt: new Date(Date.now() - 20 * 60_000) } });
  const [a, b] = await Promise.all([claimWebhookEvent(key), claimWebhookEvent(key)]);
  assert.equal([a.claimed, b.claimed].filter(Boolean).length, 1);
  assert.equal((await claimWebhookEvent(key)).claimed, false, "a fresh claim is respected");

  const captured = { ...key, externalId: `${tag}-captured` };
  await prisma.webhookEvent.create({ data: { ...captured, status: "captured" } });
  assert.equal((await claimWebhookEvent(captured)).claimed, false, "a captured report is left to the sweep");

  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /status: "processing", claimedAt: \{ lt: leaseCut \}/, "the sweep retries expired claims");
});

test("a late status event can't make a finished call live again", () => {
  const route = read("src/app/api/webhooks/vapi/route.ts");
  const upsert = route.slice(route.indexOf('if (type === "call-started" || type === "status-update")'));
  assert.match(upsert, /where: \{ id: call\.id, status: \{ not: "completed" \} \}/);
  assert.doesNotMatch(upsert.slice(upsert.indexOf("update: {"), upsert.indexOf("update: {") + 120), /status: "in-progress"/);
});

test("a call labelled non-service still reaches the owner when the caller gave an address or is a returning customer", () => {
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /=== "other\.non_service" && !looksLikeWork/);
  assert.match(ingest, /looksLikeWork = Boolean\(freshLead\.address\?\.trim\(\) \|\| \(link && !link\.created\)\)/);
});

test("a non-service label never silences a caller who stayed on the line", () => {
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /engagedMinutes = Math\.floor\(\(durationSec \?\? 0\) \/ 60\)/);
  assert.match(ingest, /silenced = nonService && \(engagedMinutes < 1 \|\| salesPitch\) && !handoffMissed/);
  assert.match(ingest, /if \(silenced\)/);
  assert.match(ingest, /if \(!silenced\)/);
  assert.match(ingest, /worth a glance/);
});

test("a sales pitch stays silent even when the rep talks and asks for the owner", () => {
  assert.equal(looksLikeSalesSolicitation("Marketing services for the business, is the owner available?"), true);
  assert.equal(looksLikeSalesSolicitation("Hi, I'm calling from Local Rank Pros about your Google Business listing"), true);
  assert.equal(looksLikeSalesSolicitation("Press one to lower your rate, press one now"), true);
  assert.equal(looksLikeSalesSolicitation("Water pooling under the furnace, can someone come out?"), false);
  assert.equal(looksLikeSalesSolicitation("Is this Dr. Patel's dental office? Sorry, wrong number"), false);
  assert.equal(looksLikeSalesSolicitation("Furnace isn't working and it's freezing in here"), false);
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /salesPitch = looksLikeSalesSolicitation\(/);
  assert.match(ingest, /handoffMissed = wantsHuman && Boolean\(business\.transferPhone\) && !forwarded && !autoBook\.jobId && !salesPitch/);
});

test("a caller who asked for a person and never reached one always alerts", () => {
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /forwarded = call\.endedReason === "assistant-forwarded-call"/);
  assert.match(ingest, /didn't reach one — call back now/);
});

test("abandoning a promised booking pages the owner with the promise, on its own key", () => {
  const ingest = read("src/lib/call-ingest.ts");
  assert.match(ingest, /lastTry = attempts >= FINISH_MAX_ATTEMPTS/);
  assert.match(ingest, /didn't go through — call back now/);
  assert.match(ingest, /:abandoned`/);
  assert.match(ingest, /timeZone: business\.timezone/);
});
