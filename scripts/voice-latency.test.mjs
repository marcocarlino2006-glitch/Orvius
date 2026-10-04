/*
 * Voice speed from real calls (docs/BACKLOG.md M1): every end-of-call report
 * stores how long the caller waited and which stage took the time, and the
 * rollup across production calls says what to speed up next.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "VAPI_API_KEY"]) delete process.env[key];

const { summarizeTurnLatencies, voiceLatencyRollup } = await import("../src/lib/call-latency.ts");
const { captureEndOfCallReport } = await import("../src/lib/call-ingest.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const turn = (total, endpointing, model, voice, transcriber = 40) => ({
  turnLatency: total,
  endpointingLatency: endpointing,
  modelLatency: model,
  voiceLatency: voice,
  transcriberLatency: transcriber,
});

test("a call's turns become a typical reply, a slow reply and a median per stage", () => {
  const summary = summarizeTurnLatencies([turn(900, 300, 400, 150), turn(1100, 300, 600, 150), turn(1800, 800, 700, 250), { turnLatency: 0 }, {}]);
  assert.deepEqual(summary, {
    turns: 3,
    p50: 1100,
    p90: 1800,
    stages: { endpointing: 300, transcriber: 40, model: 600, voice: 150 },
  });
  assert.equal(summarizeTurnLatencies([]), null);
  assert.equal(summarizeTurnLatencies(undefined), null);
});

test("the end-of-call report stores the caller's wait on the call", async () => {
  const shop = await prisma.business.create({ data: { name: "Quick Air", slug: `quick-${stamp()}`, environment: "production" } });
  try {
    const vapiCallId = `lat-${stamp()}`;
    const captured = await captureEndOfCallReport({
      business: { id: shop.id },
      vapiCallId,
      message: {
        type: "end-of-call-report",
        call: { id: vapiCallId, customer: { number: "+15125550166" } },
        summary: "AC not cooling",
        analysis: { structuredData: { name: "Ana", phone: "+15125550166", serviceType: "AC not cooling" } },
        artifact: { performanceMetrics: { turnLatencies: [turn(800, 200, 400, 150), turn(1400, 700, 500, 150)] } },
      },
    });
    assert.equal(captured.duplicate, false);
    const call = await prisma.call.findUnique({ where: { vapiCallId } });
    assert.equal(call.replyP50Ms, 1400);
    assert.equal(call.replyP90Ms, 1400);
    assert.deepEqual(JSON.parse(call.latencyJson), { turns: 2, stages: { endpointing: 700, transcriber: 40, model: 500, voice: 150 } });

    const rollup = await voiceLatencyRollup(new Date(Date.now() - 60_000));
    assert.ok(rollup.calls >= 1);
    assert.ok(["endpointing", "model", "voice", "transcriber"].includes(rollup.slowestStage));
  } finally {
    await drop(shop.id);
  }
});

test("a report without timing still captures the call", async () => {
  const shop = await prisma.business.create({ data: { name: "Quiet Air", slug: `quiet-${stamp()}` } });
  try {
    const vapiCallId = `nolat-${stamp()}`;
    await captureEndOfCallReport({
      business: { id: shop.id },
      vapiCallId,
      message: { type: "end-of-call-report", call: { id: vapiCallId }, summary: "Wrong number" },
    });
    const call = await prisma.call.findUnique({ where: { vapiCallId } });
    assert.equal(call.status, "completed");
    assert.equal(call.replyP50Ms, null);
  } finally {
    await drop(shop.id);
  }
});

test("test and demo shops never count toward production speed", async () => {
  const test = await prisma.business.create({ data: { name: "Test Air", slug: `testlat-${stamp()}`, environment: "test" } });
  try {
    const since = new Date(Date.now() - 1000);
    const before = await voiceLatencyRollup(since);
    await prisma.call.create({ data: { businessId: test.id, vapiCallId: `t-${stamp()}`, replyP50Ms: 99_00, replyP90Ms: 99_00 } });
    const after = await voiceLatencyRollup(since);
    assert.equal(after.calls, before.calls);
  } finally {
    await drop(test.id);
  }
});

test("tool round trips are timed and the sim report breaks the wait into stages", () => {
  const route = readFileSync(new URL("../src/app/api/webhooks/vapi/route.ts", import.meta.url), "utf8");
  assert.match(route, /in_call\.tool_ms/);
  assert.match(route, /const \[call, shop\] = await Promise\.all\(/);
  const sim = readFileSync(new URL("./voice-sim.mjs", import.meta.url), "utf8");
  assert.match(sim, /Median per stage: endpointing/);
  const cron = readFileSync(new URL("../src/app/api/cron/notifications/route.ts", import.meta.url), "utf8");
  assert.match(cron, /voice\.latency_daily/);
});
