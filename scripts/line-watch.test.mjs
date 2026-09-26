#!/usr/bin/env node
/*
 * A call Vapi finished but Orvius never saved is recovered from Vapi's copy,
 * and the owner is asked to call back anyone who cannot be recovered.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY", "VAPI_API_KEY"]) {
  delete process.env[key];
}

const { findLostCalls, reportFromVapiCall, watchShopLine, LOST_CALL_GRACE_MS } = await import("../src/lib/line-watch.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const NOW = new Date("2026-09-26T12:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

function vapiCall(overrides = {}) {
  return {
    id: `vc_${uid()}`,
    type: "inboundPhoneCall",
    status: "ended",
    startedAt: ago(30),
    endedAt: ago(28),
    customer: { number: "+13125550177" },
    analysis: {
      summary: "Nina Park called because her AC is blowing warm air.",
      structuredData: { name: "Nina Park", phone: "+13125550177", serviceType: "AC blowing warm air", urgency: "this-week", address: "5 Birch Ln, Evanston IL 60201" },
    },
    artifact: { transcript: "AI: Summit HVAC.\nUser: My AC is blowing warm air." },
    ...overrides,
  };
}

test("only finished inbound calls past the grace window, not already saved, count as lost", () => {
  const saved = vapiCall();
  const fresh = vapiCall({ endedAt: new Date(NOW.getTime() - LOST_CALL_GRACE_MS + 60_000).toISOString() });
  const live = vapiCall({ status: "in-progress", endedAt: undefined });
  const outbound = vapiCall({ type: "outboundPhoneCall" });
  const lost = vapiCall();
  assert.deepEqual(
    findLostCalls([saved, fresh, live, outbound, lost], new Set([saved.id]), NOW).map((c) => c.id),
    [lost.id],
  );
  const report = reportFromVapiCall(lost);
  assert.equal(report.type, "end-of-call-report");
  assert.equal(report.durationSeconds, 120);
  assert.equal(report.call.customer.number, "+13125550177");
  assert.match(report.transcript, /blowing warm air/);
});

test("a lost call is recovered into a full record, and a second pass changes nothing", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Watch Test HVAC",
      slug: `watch-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerPhone: "+15550001111",
      ownerEmail: `owner-${uid()}@example.test`,
      vapiAssistantId: `asst_${uid()}`,
    },
  });
  try {
    const lost = vapiCall();
    const stuck = vapiCall({ customer: { number: "+13125550178" } });
    await prisma.webhookEvent.create({
      data: { source: "vapi", externalId: stuck.id, eventType: "end-of-call-report", businessId: shop.id, status: "processed" },
    });
    const deps = { listCalls: async () => [lost, stuck], lineProblem: async () => null };

    const first = await watchShopLine(shop, { now: NOW, deps });
    assert.deepEqual(first.recovered, [lost.id]);
    assert.deepEqual(first.unrecovered, [stuck.id]);

    const call = await prisma.call.findUniqueOrThrow({ where: { vapiCallId: lost.id }, include: { lead: true } });
    assert.equal(call.callerPhone, "+13125550177");
    assert.equal(call.lead?.name, "Nina Park");
    const alerts = await prisma.ownerNotification.findMany({ where: { businessId: shop.id, dedupeKey: `lost-call:${stuck.id}` } });
    assert.ok(alerts.length >= 1);
    assert.match(alerts[0].message, /A call from \+13125550178 reached your line but was not saved\. Call them back\./);

    const second = await watchShopLine(shop, { now: NOW, deps });
    assert.deepEqual(second.recovered, []);
    assert.equal(await prisma.call.count({ where: { businessId: shop.id } }), 1);
    assert.equal(
      await prisma.ownerNotification.count({ where: { businessId: shop.id, dedupeKey: `lost-call:${stuck.id}` } }),
      alerts.length,
    );
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
