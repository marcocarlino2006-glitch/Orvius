/*
 * What happens to a call we cannot attribute to a shop.
 *
 * The Vapi webhook answered 200 and filed the miss as "skipped", which reads
 * like a decision and behaves like one: 200 tells Vapi the report was handled,
 * and claimWebhookEvent treats a skipped row as settled forever. So a call
 * that arrived a moment before its shop row was visible produced no lead, no
 * alert, and no second chance — and nothing anywhere said a job had gone
 * missing.
 *
 * The route now answers 503 and files the miss as "failed". These tests cover
 * the half of that which decides whether the redelivery is worth anything: the
 * claim. A 503 that Vapi honours is useless if our own record of the first
 * miss turns the retry away at the door.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  claimWebhookEvent,
  completeWebhookEvent,
  recordWebhookEvent,
} from "../src/lib/webhook-events.ts";

const prisma = new PrismaClient();

const callId = (label) =>
  `dropped-${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const dropEvent = (externalId) =>
  prisma.webhookEvent.deleteMany({ where: { externalId } }).catch(() => {});

test("a miss filed as failed lets the redelivery through", async () => {
  const externalId = callId("failed");
  try {
    await recordWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
      status: "failed",
      error: "business not found",
    });

    /* The shop row is visible now, and Vapi sends the report again. */
    const { claimed } = await claimWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
    });

    assert.equal(claimed, true, "the second delivery gets to run");
    const row = await prisma.webhookEvent.findFirst({ where: { externalId } });
    assert.equal(row.status, "processing");
    assert.equal(row.error, null, "the first miss is cleared, not carried");
  } finally {
    await dropEvent(externalId);
  }
});

test("a miss filed as skipped turns the redelivery away", async () => {
  const externalId = callId("skipped");
  try {
    /*
      The old behaviour, kept as a test so the two lines stay tied together.
      If someone files a recoverable miss as "skipped" again, the retry it was
      meant to enable is dead on arrival and this is where that shows up.
    */
    await recordWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
      status: "skipped",
      error: "business not found",
    });

    const { claimed } = await claimWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
    });

    assert.equal(claimed, false, "skipped is a verdict, not a pause");
  } finally {
    await dropEvent(externalId);
  }
});

test("a call already handled is not handled twice", async () => {
  const externalId = callId("processed");
  try {
    await claimWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
    });
    await completeWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
    });

    const { claimed } = await claimWebhookEvent({
      source: "vapi",
      externalId,
      eventType: "end-of-call-report",
    });

    assert.equal(
      claimed,
      false,
      "making misses retryable must not make successes retryable",
    );
  } finally {
    await dropEvent(externalId);
  }
});

test("an unrouted text is written down rather than only logged", async () => {
  const externalId = callId("sms");
  try {
    /*
      Twilio does not retry inbound message webhooks and a non-2xx would also
      swallow the courteous reply to the customer, so this path cannot borrow
      the Vapi answer. Recording the miss is the whole remedy: a text sent to
      one of our own numbers that reached no shop is a misconfiguration, and it
      needs to be countable rather than buried in a log line nobody queries.
    */
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId,
      eventType: "inbound",
      status: "failed",
      payload: { from: "+15555550123", to: "+15555550199" },
      error: "no shop owns this inbound number",
    });

    const misses = await prisma.webhookEvent.findMany({
      where: { source: "twilio-sms", status: "failed", externalId },
    });
    assert.equal(misses.length, 1);
    assert.equal(misses[0].error, "no shop owns this inbound number");
    assert.ok(misses[0].payloadJson, "the number that was dialled is kept");
  } finally {
    await dropEvent(externalId);
  }
});

test.after(() => prisma.$disconnect());
