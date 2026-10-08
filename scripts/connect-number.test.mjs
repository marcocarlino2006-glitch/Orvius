#!/usr/bin/env node
/*
 * Connect your number → choose coverage → test → activate. Guided where Orvius
 * can't reach (carrier settings), proven by a real test call, and always
 * reversible. A receiving number existing is never treated as proof.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  CARRIER_PATHS,
  PORT_OUT_RIGHTS,
  connectSteps,
  connectionHealth,
  dialHref,
  disconnectSteps,
  forwardTestVerdict,
  forwardingCodes,
} from "../src/lib/number-connection.ts";
import { checkForwardTest, recordForwardTestArrival, startForwardTest } from "../src/lib/forward-test.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const prisma = new PrismaClient();
const LINE = "+15125550100";

test.after(async () => {
  await prisma.business.deleteMany({ where: { slug: { startsWith: "connect-number-" } } });
  await prisma.$disconnect();
});

test("carrier codes match the coverage, and each has an off code", () => {
  assert.deepEqual(forwardingCodes("verizon", "missed", LINE), { on: "*715125550100", off: "*73" });
  assert.deepEqual(forwardingCodes("verizon", "all", LINE), { on: "*725125550100", off: "*73" });
  assert.deepEqual(forwardingCodes("att", "missed", LINE), { on: "**004*15125550100#", off: "##004#" });
  assert.deepEqual(forwardingCodes("tmobile", "all", LINE), { on: "**21*15125550100#", off: "##21#" });
  assert.equal(forwardingCodes("other", "missed", LINE), null, "no guessed codes for unknown carriers");
  assert.equal(forwardingCodes("voip", "missed", LINE), null);
  assert.equal(dialHref("**004*15125550100#"), "tel:**004*15125550100%23");
});

test("nothing claims Orvius can change a carrier's settings, and schedules are only offered where they exist", () => {
  for (const path of Object.values(CARRIER_PATHS)) assert.match(path.howItWorks, /can't|doesn't/);
  assert.ok(!CARRIER_PATHS.verizon.coverages.includes("after_hours"));
  assert.ok(CARRIER_PATHS.voip.coverages.includes("after_hours"));
  assert.match(connectSteps("verizon", "missed", LINE)[0], /\*715125550100/);
  assert.match(disconnectSteps("att", "missed", LINE)[0], /##004#/);
  assert.match(PORT_OUT_RIGHTS, /optional/);
  assert.match(PORT_OUT_RIGHTS, /never released/);
});

test("test verdicts say what happened and what to do, in plain words", () => {
  const base = { elapsedMs: 70_000, coverage: "missed" };
  assert.equal(forwardTestVerdict({ ...base, arrived: true, outbound: "completed" }).state, "reached");
  assert.equal(forwardTestVerdict({ ...base, arrived: false, outbound: "ringing", elapsedMs: 5_000 }).state, "calling");
  const missed = forwardTestVerdict({ ...base, arrived: false, outbound: "no-answer" });
  assert.equal(missed.title, "Your test call didn't reach Orvius — check forwarding.");
  assert.match(forwardTestVerdict({ ...base, arrived: false, outbound: "completed" }).title, /voicemail/);
  assert.equal(forwardTestVerdict({ ...base, arrived: false, outbound: "busy" }).state, "busy");
  assert.equal(forwardTestVerdict({ ...base, arrived: false, outbound: "failed" }).state, "failed");
});

test("a line existing is not proof; only a call through the business number is", () => {
  assert.equal(connectionHealth({ testMode: false, line: LINE, provenAt: null, lastTest: null }).state, "not_proven");
  assert.equal(connectionHealth({ testMode: false, line: LINE, provenAt: new Date(), lastTest: null }).state, "proven");
  const failedAfter = connectionHealth({
    testMode: false,
    line: LINE,
    provenAt: new Date("2026-10-01"),
    lastTest: { state: "not_reached", title: "Your test call didn't reach Orvius — check forwarding.", at: new Date("2026-10-02") },
  });
  assert.equal(failedAfter.state, "test_failed");
  assert.equal(connectionHealth({ testMode: true, line: null, provenAt: null, lastTest: null }).state, "test_mode");
});

function fakeTwilio({ outboundStatus, inbound }) {
  const calls = (sid) => ({ fetch: async () => ({ status: outboundStatus, sid }) });
  calls.create = async () => ({ sid: "CAtest" });
  calls.list = async () => inbound;
  return { calls };
}

async function shop() {
  return prisma.business.create({
    data: {
      name: "Connect Shop",
      slug: `connect-number-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      environment: "production",
      twilioPhone: LINE,
      phone: "+15125550199",
      lineVerifiedAt: new Date(),
    },
  });
}

test("the test call proves the connection when it comes back to the line", async () => {
  const b = await shop();
  const client = fakeTwilio({ outboundStatus: "completed", inbound: [{ from: LINE }] });
  const started = await startForwardTest({ business: b, businessNumber: b.phone, coverage: "missed", client });
  assert.ok(started.ok);
  const view = await checkForwardTest({ businessId: b.id, id: started.id, line: LINE, client, now: new Date(Date.now() + 20_000) });
  assert.equal(view.state, "reached");
  const after = await prisma.business.findUnique({ where: { id: b.id } });
  assert.ok(after.overflowProvedAt, "proof is stamped");
});

test("a test that never arrives fails with the fix, and proves nothing", async () => {
  const b = await shop();
  const client = fakeTwilio({ outboundStatus: "no-answer", inbound: [] });
  const started = await startForwardTest({ business: b, businessNumber: b.phone, coverage: "missed", client });
  const view = await checkForwardTest({ businessId: b.id, id: started.id, line: LINE, client, now: new Date(Date.now() + 70_000) });
  assert.equal(view.state, "not_reached");
  assert.match(view.fix, /Turn forwarding on/);
  const after = await prisma.business.findUnique({ where: { id: b.id } });
  assert.equal(after.overflowProvedAt, null);
});

test("the webhook's arrival settles the test, and the test leg is never a customer call", async () => {
  const b = await shop();
  const client = fakeTwilio({ outboundStatus: "in-progress", inbound: [] });
  await startForwardTest({ business: b, businessNumber: b.phone, coverage: "all", client });
  assert.equal(await recordForwardTestArrival(b.id), true);
  assert.equal(await recordForwardTestArrival(b.id), true, "later webhooks for the same call are still swallowed");
  const t = await prisma.forwardTest.findFirst({ where: { businessId: b.id } });
  assert.equal(t.state, "reached");
  const hook = read("src/app/api/webhooks/vapi/route.ts");
  assert.ok(hook.indexOf("recordForwardTestArrival") < hook.indexOf("captureEndOfCallReport({"));
});

test("Orvius won't dial its own line or start without a number", async () => {
  const b = await shop();
  const client = fakeTwilio({ outboundStatus: "completed", inbound: [] });
  const same = await startForwardTest({ business: b, businessNumber: LINE, coverage: "missed", client });
  assert.equal(same.ok, false);
  const none = await startForwardTest({ business: b, businessNumber: "", coverage: "missed", client });
  assert.equal(none.ok, false);
});

test("a ported-in number is never released, and Command shows whether calls reach Orvius", () => {
  assert.match(read("src/lib/line-lifecycle.ts"), /NOT: \{ portRequest: \{ is: \{ status: "done" \} \} \}/);
  const pulse = read("src/components/orvius-pulse.tsx");
  assert.match(pulse, /label="Your calls"/);
  assert.match(read("src/lib/shop-health.ts"), /connection: connectionHealth/);
  const ui = read("src/components/connect-number.tsx");
  assert.doesNotMatch(ui, /Twilio|Vapi/);
});
