#!/usr/bin/env node
/**
 * Load test — a burst of end-of-call webhooks against a running app, the way a
 * cold snap hits a shop: many callers at once, and Vapi re-delivering some
 * reports. Reports latency, errors, and whether the records came out right:
 * one call and one lead per real call, and never two jobs for one call.
 *
 * Seeds its own test-environment shop and deletes it afterwards.
 *
 *   APP_URL=http://127.0.0.1:3000 VAPI_WEBHOOK_SECRET=… node scripts/load-test.mjs [--calls 200] [--concurrency 25] [--dupes 0.2] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET?.trim();
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const CALLS = Number(arg("--calls", 200));
const CONCURRENCY = Number(arg("--concurrency", 25));
const DUPES = Number(arg("--dupes", 0.2));
const jsonOut = arg("--json", null);

const stamp = Date.now();
const digits = String(stamp).slice(-6);
const line = `+1555${digits}1`;

const ISSUES = [
  ["Furnace blowing cold air", "same-day"],
  ["AC not cooling", "same-day"],
  ["Thermostat blank", "this-week"],
  ["Annual tune-up", "flexible"],
  ["Water heater leaking", "same-day"],
];
const STREETS = ["Ridge Ave", "Hinman Ave", "Davis St", "Main St", "Church St", "Chicago Ave"];

export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function report(i) {
  const [serviceType, urgency] = ISSUES[i % ISSUES.length];
  const phone = `+1312${digits.slice(-3)}${String(i).padStart(4, "0")}`;
  const address = `${100 + i} ${STREETS[i % STREETS.length]}, Evanston IL 6020${1 + (i % 2)}`;
  return {
    callId: `load_${stamp}_${i}`,
    phone,
    body: {
      message: {
        type: "end-of-call-report",
        call: { id: `load_${stamp}_${i}`, customer: { number: phone }, phoneNumber: { number: line } },
        summary: `Caller reports: ${serviceType.toLowerCase()}.`,
        transcript: `AI: What's going on?\nUser: ${serviceType}.\nAI: Address?\nUser: ${address}.`,
        durationSeconds: 90 + (i % 60),
        analysis: { structuredData: { name: `Load Caller ${i}`, phone, serviceType, urgency, address } },
      },
    },
  };
}

async function post(body) {
  const started = performance.now();
  try {
    const res = await fetch(`${APP_URL}/api/webhooks/vapi`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(VAPI_SECRET ? { "x-vapi-secret": VAPI_SECRET } : {}) },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    return { ms: performance.now() - started, status: res.status };
  } catch (err) {
    return { ms: performance.now() - started, status: 0, error: String(err?.message ?? err) };
  }
}

async function main() {
  const business = await prisma.business.create({
    data: {
      name: `Load Heating ${digits}`,
      slug: `load-test-${stamp}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `load-${stamp}@orvius.test`,
      ownerPhone: `+1555${digits}8`,
      twilioPhone: line,
      vapiPhoneNumber: line,
      lineVerifiedAt: new Date(),
      billingStatus: "active",
      address: "100 Main St, Evanston IL 60201",
      servicesJson: JSON.stringify([{ name: "Furnace repair" }, { name: "AC repair" }, { name: "Tune-ups" }]),
      serviceZipsJson: JSON.stringify(["60201", "60202"]),
      hoursJson: "{}",
      timezone: "America/Chicago",
    },
  });

  const reports = Array.from({ length: CALLS }, (_, i) => report(i));
  const deliveries = reports.map((r) => r.body);
  const dupeCount = Math.round(CALLS * DUPES);
  for (let i = 0; i < dupeCount; i++) deliveries.push(reports[Math.floor((i * CALLS) / Math.max(1, dupeCount))].body);
  for (let i = deliveries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deliveries[i], deliveries[j]] = [deliveries[j], deliveries[i]];
  }

  console.log(`\n⚡ Load test · ${APP_URL} · ${CALLS} calls + ${dupeCount} re-deliveries · ${CONCURRENCY} at a time\n`);
  const results = [];
  let next = 0;
  const wallStart = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < deliveries.length) results.push(await post(deliveries[next++]));
    }),
  );
  const wallMs = performance.now() - wallStart;

  // Background work (auto-job, owner alert) runs after the response.
  await new Promise((r) => setTimeout(r, 4000));

  try {
    const callIds = reports.map((r) => r.callId);
    const [callRows, leadCount, jobs] = await Promise.all([
      prisma.call.count({ where: { businessId: business.id } }),
      prisma.lead.count({ where: { businessId: business.id } }),
      prisma.job.findMany({ where: { businessId: business.id }, select: { lead: { select: { phone: true } } } }),
    ]);
    const jobsPerCaller = new Map();
    for (const j of jobs) {
      const phone = j.lead?.phone;
      if (phone) jobsPerCaller.set(phone, (jobsPerCaller.get(phone) ?? 0) + 1);
    }
    const duplicateJobs = [...jobsPerCaller.values()].filter((n) => n > 1).length;

    const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
    const errors = results.filter((r) => r.status < 200 || r.status >= 300);
    const summary = {
      at: new Date().toISOString(),
      appUrl: APP_URL,
      calls: CALLS,
      redeliveries: dupeCount,
      concurrency: CONCURRENCY,
      requests: results.length,
      wallSeconds: +(wallMs / 1000).toFixed(2),
      requestsPerSecond: +(results.length / (wallMs / 1000)).toFixed(1),
      latencyMs: {
        p50: Math.round(percentile(latencies, 50)),
        p95: Math.round(percentile(latencies, 95)),
        p99: Math.round(percentile(latencies, 99)),
        max: Math.round(latencies.at(-1)),
      },
      errors: errors.length,
      errorSamples: [...new Set(errors.map((e) => e.error ?? `HTTP ${e.status}`))].slice(0, 5),
      callRecords: callRows,
      leads: leadCount,
      jobs: jobs.length,
      callersWithMoreThanOneJob: duplicateJobs,
      expectedCallIds: callIds.length,
    };

    const checks = [
      [summary.errors === 0, `no failed requests (${summary.errors})`],
      [callRows === CALLS, `one call record per call (${callRows}/${CALLS})`],
      [leadCount === CALLS, `one lead per call (${leadCount}/${CALLS})`],
      [duplicateJobs === 0, `no caller booked twice (${duplicateJobs})`],
    ];
    console.log(`p50 ${summary.latencyMs.p50}ms · p95 ${summary.latencyMs.p95}ms · p99 ${summary.latencyMs.p99}ms · max ${summary.latencyMs.max}ms`);
    console.log(`${summary.requests} requests in ${summary.wallSeconds}s (${summary.requestsPerSecond}/s) · ${summary.jobs} jobs booked\n`);
    for (const [ok, label] of checks) console.log(`${ok ? "✅" : "❌"} ${label}`);
    if (summary.errorSamples.length) console.log(`   errors: ${summary.errorSamples.join(" | ")}`);
    if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...summary, checks: checks.map(([ok, label]) => ({ ok, label })) }, null, 2));
    if (checks.some(([ok]) => !ok)) process.exitCode = 1;
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
    await prisma.$disconnect?.();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
