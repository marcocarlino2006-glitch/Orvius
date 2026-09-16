#!/usr/bin/env node
/**
 * Does a webhook actually advance a due owner alert?
 *
 * The gate and the unit test both read source. This one plants a retry that
 * fell due while the phone was quiet, sends the delivery receipt that a real
 * Twilio callback would send, and reads the row back.
 */
import { createRequire } from "node:module";

import { PrismaClient } from "@prisma/client";

const twilio = createRequire(import.meta.url)("twilio");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
/* Must match the token and ORVIUS_API_URL the server under test was started with. */
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "probe-auth-token";
const SIGNED_URL = `${process.env.ORVIUS_API_URL ?? BASE}/api/webhooks/twilio/status`;

/* Signed with the same library the route validates with, so a 403 here means
   the request was genuinely rejected and not that the probe got it wrong. */
const twilioSignature = (url, params) =>
  twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);

const prisma = new PrismaClient();

const business = await prisma.business.findFirst({ where: { isActive: true } });
if (!business) throw new Error("no active shop in the local database");

const due = await prisma.ownerNotification.create({
  data: {
    businessId: business.id,
    channel: "sms",
    status: "pending",
    attempts: 1,
    dedupeKey: `drain-probe-${Date.now()}`,
    businessName: business.name,
    message: "drain probe",
    ownerPhone: "+15555550123",
    nextRetryAt: new Date(Date.now() - 60_000),
  },
});

console.log(`planted  ${due.id}  status=${due.status} attempts=${due.attempts} due 60s ago`);

const params = { MessageSid: `SM${Date.now()}`, MessageStatus: "delivered" };
const res = await fetch(`${BASE}/api/webhooks/twilio/status`, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "x-twilio-signature": twilioSignature(SIGNED_URL, params),
  },
  body: new URLSearchParams(params),
});
console.log(`webhook  POST /api/webhooks/twilio/status → ${res.status} ${await res.text()}`);

/* after() runs once the response is flushed, so give it a moment to land. */
await new Promise((r) => setTimeout(r, 3000));

const seen = await prisma.ownerNotification.findUnique({ where: { id: due.id } });
console.log(`readback ${seen.id}  status=${seen.status} attempts=${seen.attempts}`);

const advanced = seen.attempts > due.attempts || seen.status !== "pending";
console.log(
  advanced
    ? "\nPASS — the webhook drained the queue and the retry advanced"
    : "\nFAIL — the row sat untouched; nothing but the daily cron would move it",
);

await prisma.ownerNotification.delete({ where: { id: due.id } }).catch(() => {});
await prisma.$disconnect();
process.exit(advanced ? 0 : 1);
