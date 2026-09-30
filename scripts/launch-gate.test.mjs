#!/usr/bin/env node
/*
 * The founder's launch card must say exactly what keeps signup closed, and
 * whether texts from our number reach phones, with the fix for each. It reads
 * Twilio's toll-free verification status; a check that fails must never read
 * as "verified" or as "not submitted".
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkTextDelivery, getLaunchGate } from "../src/lib/launch-gate.ts";

const LAUNCH_ENV = [
  "ORVIUS_SELF_SERVE_SIGNUP",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
  "VAPI_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "RESEND_API_KEY",
];
for (const key of LAUNCH_ENV) delete process.env[key];

const twilio = { owns: true, verifications: [], numbersStatus: 200 };
const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Basic ${Buffer.from("ACtest:tok").toString("base64")}`) return send(401, {});
  if (req.url.startsWith("/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers.json")) {
    if (twilio.numbersStatus !== 200) return send(twilio.numbersStatus, {});
    return send(200, { incoming_phone_numbers: twilio.owns ? [{ sid: "PN123" }] : [] });
  }
  if (req.url === "/v1/Tollfree/Verifications?TollfreePhoneNumberSid=PN123") return send(200, { verifications: twilio.verifications });
  send(404, {});
});

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.TWILIO_API_BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

function withTwilio() {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "tok", TWILIO_PHONE_NUMBER: "+18446439170" });
}

test("with nothing configured, every blocker is named with its fix and signup stays closed", async () => {
  const gate = await getLaunchGate();
  assert.equal(gate.signupOpen, false);
  const byKey = Object.fromEntries(gate.items.map((i) => [i.key, i]));
  assert.ok(byKey.telephonyReady.fix.some((f) => f.includes("TWILIO_ACCOUNT_SID")));
  assert.ok(byKey.billingReady.fix.some((f) => f.includes("STRIPE_SECRET_KEY")));
  assert.ok(byKey.emailReady.fix.some((f) => f.includes("RESEND_API_KEY")));
  assert.ok(byKey.voiceWebhookReady.fix.length);
  assert.equal(byKey.selfServeEnabled.ready, false);
  assert.equal(byKey.textDelivery.blocksSignup, false, "delivery warns but does not hold signup shut");
  assert.equal(gate.blockers, gate.items.filter((i) => i.blocksSignup && !i.ready).length);
  for (const item of gate.items) {
    if (!item.ready) assert.ok(item.fix.length, `${item.key} says what to do`);
  }
});

test("toll-free status is read from Twilio and each state says what to do", async () => {
  withTwilio();
  twilio.verifications = [];
  let delivery = await checkTextDelivery();
  assert.deepEqual([delivery.tollFree, delivery.checked, delivery.status], [true, true, null]);
  let item = (await getLaunchGate({ textDelivery: delivery })).items.find((i) => i.key === "textDelivery");
  assert.equal(item.ready, false);
  assert.match(item.fix.join(" "), /not verified/);
  assert.match(item.fix.join(" "), /TOLL-FREE-VERIFICATION\.md/);

  twilio.verifications = [
    { status: "TWILIO_REJECTED", rejection_reason: "Opt-in URL unreachable", date_created: "2026-09-01T00:00:00Z" },
    { status: "IN_REVIEW", rejection_reason: null, date_created: "2026-09-20T00:00:00Z" },
  ];
  delivery = await checkTextDelivery();
  assert.equal(delivery.status, "IN_REVIEW", "the newest submission wins");
  item = (await getLaunchGate({ textDelivery: delivery })).items.find((i) => i.key === "textDelivery");
  assert.match(item.fix[0], /in review/);

  twilio.verifications = [{ status: "TWILIO_REJECTED", rejection_reason: "Opt-in URL unreachable", date_created: "2026-09-21T00:00:00Z" }];
  item = (await getLaunchGate()).items.find((i) => i.key === "textDelivery");
  assert.match(item.fix[0], /Opt-in URL unreachable/);

  twilio.verifications = [{ status: "TWILIO_APPROVED", date_created: "2026-09-22T00:00:00Z" }];
  item = (await getLaunchGate()).items.find((i) => i.key === "textDelivery");
  assert.equal(item.ready, true);
  assert.deepEqual(item.fix, []);
});

test("a check that fails is reported as unknown, never as verified or unsubmitted", async () => {
  withTwilio();
  twilio.numbersStatus = 500;
  const delivery = await checkTextDelivery();
  assert.equal(delivery.checked, false);
  const item = (await getLaunchGate({ textDelivery: delivery })).items.find((i) => i.key === "textDelivery");
  assert.equal(item.ready, false);
  assert.match(item.fix[0], /Could not read/);
  twilio.numbersStatus = 200;

  twilio.owns = false;
  const foreign = (await getLaunchGate()).items.find((i) => i.key === "textDelivery");
  assert.match(foreign.fix[0], /not a number on this Twilio account/);
  twilio.owns = true;

  process.env.TWILIO_PHONE_NUMBER = "+15125550100";
  const local = await checkTextDelivery();
  assert.equal(local.tollFree, false);
  assert.equal((await getLaunchGate({ textDelivery: local })).items.find((i) => i.key === "textDelivery").ready, true);
});

test("the card is founder-only and the SMS terms cover every text the number sends", () => {
  const route = readFileSync(new URL("../src/app/api/admin/launch-gate/route.ts", import.meta.url), "utf8");
  assert.match(route, /isPrivilegedRequest\(request\)/);
  const terms = readFileSync(new URL("../src/app/sms-terms/page.tsx", import.meta.url), "utf8");
  for (const kind of [/Owner alerts/, /Service texts to a shop/, /follow-up/, /deposit or invoice/, /Reply <strong>STOP<\/strong>/]) {
    assert.match(terms, kind);
  }
  for (const rel of ["../src/lib/customer-confirm.ts", "../src/lib/invoice-pay.ts", "../src/lib/booking-deposit.ts"]) {
    assert.match(readFileSync(new URL(rel, import.meta.url), "utf8"), /withSmsOptOutFooter\(/, `${rel} texts carry the STOP line`);
  }
});
