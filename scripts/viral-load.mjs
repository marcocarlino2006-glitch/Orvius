#!/usr/bin/env node
/**
 * Viral-day load: what a launch post sends at the public site all at once.
 *
 *   1. Page views across the pages a post links to.
 *   2. A rush on the talk-in-the-browser line: many visitors join, poll, some
 *      give up, the rest take their turn and hang up. The line must never hand
 *      out more slots than the cap, because every slot is a call on the Vapi
 *      account paying shops depend on.
 *   3. A burst of waitlist sign-ups.
 *
 * Start the app with VAPI_API_KEY set (any value; no call is placed, turns are
 * held then ended) and the cap you want to check, e.g.
 *   VAPI_API_KEY=x ORVIUS_DEMO_WEB_MAX_LIVE=10 npm start
 *   APP_URL=http://127.0.0.1:3000 node scripts/viral-load.mjs [--views 2000] [--concurrency 100] [--visitors 300] [--hold 6] [--signups 200] [--json out.json]
 *
 * Every visitor gets its own address, so per-visitor limits aren't what's being
 * measured. Waitlist rows it creates use @load.orvius.test and are deleted.
 */
import { writeFileSync } from "node:fs";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const VIEWS = Number(arg("--views", 2000));
const CONCURRENCY = Number(arg("--concurrency", 100));
const VISITORS = Number(arg("--visitors", 300));
const HOLD_SEC = Number(arg("--hold", 6));
const SIGNUPS = Number(arg("--signups", 200));
const CAP = Number(process.env.ORVIUS_DEMO_WEB_MAX_LIVE ?? 10);
const jsonOut = arg("--json", null);
const PAGES = ["/", "/launch", "/try", "/calls", "/pricing", "/watch"];
const stamp = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : null);
const summary = (ms) => {
  const s = [...ms].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s.at(-1) ?? null };
};
let ipSeq = 0;
const nextIp = () => {
  const n = ++ipSeq;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

async function timed(path, init = {}, ip = nextIp()) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${APP_URL}${path}`, { ...init, headers: { "x-real-ip": ip, ...(init.headers ?? {}) } });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => null) : await res.text();
    return { ok: res.ok, status: res.status, ms: performance.now() - t0, body };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - t0, body: String(error) };
  }
}

async function pool(n, concurrency, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, async () => {
    while (next < n) await task(next++);
  }));
}

async function pageViews() {
  const byPath = Object.fromEntries(PAGES.map((p) => [p, { ms: [], errors: 0, statuses: {} }]));
  const t0 = performance.now();
  await pool(VIEWS, CONCURRENCY, async (i) => {
    const path = PAGES[i % PAGES.length];
    const r = await timed(path);
    const row = byPath[path];
    row.ms.push(r.ms);
    if (!r.ok) {
      row.errors++;
      row.statuses[r.status] = (row.statuses[r.status] ?? 0) + 1;
    }
  });
  const seconds = (performance.now() - t0) / 1000;
  return {
    seconds: Number(seconds.toFixed(1)),
    perSecond: Math.round(VIEWS / seconds),
    pages: Object.fromEntries(Object.entries(byPath).map(([p, r]) => [p, { ...summary(r.ms), errors: r.errors, statuses: r.statuses }])),
  };
}

async function lineRush() {
  const post = (body, ip) => timed("/api/demo-web", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, ip);
  let holding = 0;
  let maxHolding = 0;
  const held = new Set();
  const stats = { served: 0, gaveUp: 0, closed: {}, errors: 0, rateLimited: 0, waits: [], pollMs: [], joinMs: [], stillWaiting: 0 };
  const deadline = Date.now() + Math.max(120_000, Math.ceil(VISITORS / CAP) * (HOLD_SEC + 4) * 1000 + 60_000);

  async function visitor(i) {
    const ip = nextIp();
    await sleep(Math.random() * 3000);
    const joinedAt = Date.now();
    const quitter = i % 10 === 0;
    const quitAfter = 5000 + Math.random() * 10_000;
    let r = await post({ action: "join" }, ip);
    stats.joinMs.push(r.ms);
    while (Date.now() < deadline) {
      if (r.status === 429) stats.rateLimited++;
      else if (!r.ok) stats.errors++;
      const v = r.ok ? r.body : null;
      if (v?.state === "closed") {
        stats.closed[v.reason] = (stats.closed[v.reason] ?? 0) + 1;
        return;
      }
      if (v?.state === "ready") {
        if (held.has(v.ticketId)) throw new Error("ticket granted twice");
        held.add(v.ticketId);
        holding++;
        maxHolding = Math.max(maxHolding, holding);
        stats.waits.push(Date.now() - joinedAt);
        await sleep(HOLD_SEC * 1000);
        holding--;
        await post({ action: "end", ticketId: v.ticketId }, ip);
        stats.served++;
        return;
      }
      if (quitter && Date.now() - joinedAt > quitAfter) {
        stats.gaveUp++;
        return;
      }
      await sleep((v?.pollSeconds ?? 3) * 1000);
      if (v?.ticketId) {
        r = await timed(`/api/demo-web?ticket=${encodeURIComponent(v.ticketId)}`, {}, ip);
        stats.pollMs.push(r.ms);
      } else {
        r = await post({ action: "join" }, ip);
      }
    }
    stats.stillWaiting++;
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: VISITORS }, (_, i) => visitor(i)));
  return {
    seconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
    cap: CAP,
    maxHolding,
    overCap: maxHolding > CAP,
    served: stats.served,
    gaveUp: stats.gaveUp,
    stillWaiting: stats.stillWaiting,
    closed: stats.closed,
    errors: stats.errors,
    rateLimited: stats.rateLimited,
    waitSec: Object.fromEntries(Object.entries(summary(stats.waits)).map(([k, v]) => [k, k === "n" ? v : v == null ? null : Math.round(v / 1000)])),
    joinMs: summary(stats.joinMs),
    pollMs: summary(stats.pollMs),
  };
}

async function signups() {
  const ms = [];
  let errors = 0;
  const statuses = {};
  await pool(SIGNUPS, Math.min(CONCURRENCY, 50), async (i) => {
    const r = await timed("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `viral-${stamp}-${i}@load.orvius.test`, businessName: `Load Shop ${i}`, trade: "HVAC", plan: "pro" }),
    });
    ms.push(r.ms);
    if (!r.ok) {
      errors++;
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    }
  });
  return { ...summary(ms), errors, statuses };
}

const round = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v) : v)));
const result = { app: APP_URL, at: new Date().toISOString() };
console.log(`Page views: ${VIEWS} at concurrency ${CONCURRENCY}…`);
result.pageViews = await pageViews();
console.log(JSON.stringify(round(result.pageViews), null, 2));
console.log(`Line rush: ${VISITORS} visitors, cap ${CAP}, ${HOLD_SEC}s turns…`);
result.lineRush = await lineRush();
console.log(JSON.stringify(round(result.lineRush), null, 2));
console.log(`Waitlist: ${SIGNUPS} sign-ups…`);
result.signups = await signups();
console.log(JSON.stringify(round(result.signups), null, 2));

const prisma = createScriptPrisma();
await prisma.waitlistEntry.deleteMany({ where: { email: { endsWith: "@load.orvius.test" } } }).catch(() => null);
await prisma.$disconnect();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(round(result), null, 2));
const failed = result.lineRush.overCap || result.lineRush.errors > 0 || Object.values(result.pageViews.pages).some((p) => p.errors > 0);
process.exit(failed ? 1 : 0);
