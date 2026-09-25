#!/usr/bin/env node
/**
 * Live-booking load test — many callers on the line at once, each asking the
 * receptionist for open times and holding the first one offered, the way a
 * cold snap fills a shop's morning. Then every call ends and is booked.
 *
 * Checks the promise the receptionist makes out loud: a time it held is a
 * time a technician can actually do. At no moment may more callers hold (or
 * be booked into) a time than the shop has technicians, no technician may be
 * in two places, and a caller who held a time is booked at that time.
 *
 * Seeds its own test-environment shop and deletes it afterwards.
 *
 *   APP_URL=http://127.0.0.1:3000 VAPI_WEBHOOK_SECRET=… node scripts/live-booking-load.mjs [--callers 30] [--techs 2] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET?.trim();
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const CALLERS = Number(arg("--callers", 30));
const TECHS = Number(arg("--techs", 2));
const jsonOut = arg("--json", null);

const stamp = Date.now();
const digits = String(stamp).slice(-6);
const line = `+1555${digits}3`;
const SERVICE = "Furnace blowing cold air";

/** Most intervals overlapping at any instant. Touching ends do not overlap. */
export function maxOverlap(intervals) {
  const edges = intervals.flatMap(([start, end]) => [
    [start, 1],
    [end, -1],
  ]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let max = 0;
  for (const [, d] of edges) {
    open += d;
    max = Math.max(max, open);
  }
  return max;
}

async function webhook(message) {
  const res = await fetch(`${APP_URL}/api/webhooks/vapi`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(VAPI_SECRET ? { "x-vapi-secret": VAPI_SECRET } : {}) },
    body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

const callOf = (i) => ({
  id: `live_${stamp}_${i}`,
  customer: { number: `+1312${digits.slice(-3)}${String(i).padStart(4, "0")}` },
  phoneNumber: { number: line },
});

async function tool(i, name, argsObj) {
  const data = await webhook({
    type: "tool-calls",
    call: callOf(i),
    toolCallList: [{ id: `tc_${name}_${i}`, type: "function", function: { name, arguments: argsObj } }],
  });
  return data.results?.[0]?.result ?? "";
}

/** A caller picks one of the first two times offered; if it was just taken, the receptionist asks again. */
async function caller(i) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const offer = await tool(i, "check_availability", { serviceType: SERVICE, urgency: "this-week" });
    const offered = [...offer.matchAll(/\[slot ([^\]]+)\]/g)].map((m) => m[1]).slice(0, 2);
    if (!offered.length) return { i, held: null, outcome: "no times offered" };
    const slot = offered[Math.floor(Math.random() * offered.length)];
    const held = await tool(i, "hold_appointment", { slot, serviceType: SERVICE });
    if (/^Held /.test(held)) return { i, held: slot, outcome: attempt ? "held after retry" : "held" };
    if (!/just taken/.test(held)) return { i, held: null, outcome: `refused: ${held.slice(0, 60)}` };
  }
  return { i, held: null, outcome: "taken three times" };
}

async function main() {
  const business = await prisma.business.create({
    data: {
      name: `Live Load Heating ${digits}`,
      slug: `live-load-${stamp}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `live-load-${stamp}@orvius.test`,
      ownerPhone: `+1555${digits}7`,
      twilioPhone: line,
      vapiPhoneNumber: line,
      lineVerifiedAt: new Date(),
      billingStatus: "active",
      address: "100 Main St, Evanston IL 60201",
      servicesJson: JSON.stringify([{ name: "Furnace repair" }]),
      serviceZipsJson: JSON.stringify(["60201", "60202"]),
      hoursJson: "{}",
      timezone: "America/Chicago",
    },
  });
  for (let t = 0; t < TECHS; t++) {
    await prisma.technician.create({
      data: { businessId: business.id, name: `Tech ${t + 1}`, phone: `+1555${digits}${t}`, skillsJson: "[]" },
    });
  }

  try {
    console.log(`\n📞 Live-booking load · ${APP_URL} · ${CALLERS} callers at once · ${TECHS} technicians\n`);
    const started = performance.now();
    const settled = await Promise.allSettled(Array.from({ length: CALLERS }, (_, i) => caller(i)));
    const holdMs = performance.now() - started;
    const results = settled.map((s, i) => (s.status === "fulfilled" ? s.value : { i, held: null, outcome: `error: ${s.reason?.message}` }));
    const errors = results.filter((r) => r.outcome.startsWith("error"));

    const holds = await prisma.call.findMany({
      where: { businessId: business.id, heldSlotAt: { not: null } },
      select: { vapiCallId: true, heldSlotAt: true, heldSlotDurationMin: true },
    });
    const holdOverlap = maxOverlap(
      holds.map((h) => [h.heldSlotAt.getTime(), h.heldSlotAt.getTime() + (h.heldSlotDurationMin ?? 90) * 60_000]),
    );

    // Every call ends at once and goes through the post-call booker.
    const endings = await Promise.allSettled(
      results.map((r) => {
        const call = callOf(r.i);
        return webhook({
          type: "end-of-call-report",
          call,
          summary: `Caller reports: ${SERVICE.toLowerCase()}.`,
          transcript: `AI: What's going on?\nUser: ${SERVICE}.\nAI: Address?\nUser: ${200 + r.i} Ridge Ave, Evanston 60201.`,
          durationSeconds: 120,
          analysis: {
            structuredData: {
              name: `Live Caller ${r.i}`,
              phone: call.customer.number,
              serviceType: SERVICE,
              urgency: "this-week",
              address: `${200 + r.i} Ridge Ave, Evanston IL 60201`,
            },
          },
        });
      }),
    );
    const endErrors = endings.filter((e) => e.status === "rejected").length;
    await new Promise((r) => setTimeout(r, 3000));

    const jobs = await prisma.job.findMany({
      where: { businessId: business.id, scheduledAt: { not: null } },
      select: { scheduledAt: true, durationMin: true, technicianId: true, lead: { select: { externalId: true } } },
    });
    const span = (j) => [j.scheduledAt.getTime(), j.scheduledAt.getTime() + (j.durationMin ?? 90) * 60_000];
    const jobOverlap = maxOverlap(jobs.map(span));
    const byTech = new Map();
    for (const j of jobs) if (j.technicianId) byTech.set(j.technicianId, [...(byTech.get(j.technicianId) ?? []), span(j)]);
    const techDoubleBooked = [...byTech.values()].filter((spans) => maxOverlap(spans) > 1).length;
    const heldById = new Map(results.filter((r) => r.held).map((r) => [callOf(r.i).id, r.held]));
    const movedFromHeld = jobs.filter((j) => {
      const held = heldById.get(j.lead?.externalId);
      return held && new Date(held).getTime() !== j.scheduledAt.getTime();
    }).length;

    const outcomes = {};
    for (const r of results) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const summary = {
      at: new Date().toISOString(),
      callers: CALLERS,
      technicians: TECHS,
      holdPhaseSeconds: +(holdMs / 1000).toFixed(2),
      outcomes,
      holds: holds.length,
      maxHoldsAtOnce: holdOverlap,
      jobs: jobs.length,
      maxJobsAtOnce: jobOverlap,
      techniciansDoubleBooked: techDoubleBooked,
      heldCallersBookedAtAnotherTime: movedFromHeld,
      errors: errors.length + endErrors,
    };
    const checks = [
      [summary.errors === 0, `no failed requests (${summary.errors})`],
      [holdOverlap <= TECHS, `never more callers holding a time than technicians (max ${holdOverlap} of ${TECHS})`],
      [jobOverlap <= TECHS, `never more jobs at once than technicians (max ${jobOverlap} of ${TECHS})`],
      [techDoubleBooked === 0, `no technician in two places (${techDoubleBooked})`],
      [movedFromHeld === 0, `every caller who held a time is booked at it (${movedFromHeld} moved)`],
    ];
    console.log(`${holds.length} holds in ${summary.holdPhaseSeconds}s · ${jobs.length} jobs booked · outcomes ${JSON.stringify(outcomes)}\n`);
    for (const [ok, label] of checks) console.log(`${ok ? "✅" : "❌"} ${label}`);
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
