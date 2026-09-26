#!/usr/bin/env node
/*
 * Rate limits are counted in the database so every server instance shares
 * one count, and customer links, test alerts and confirmation texts use them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const { sharedRateLimit, publicTokenLimited } = await import("../src/lib/rate-limit.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const uid = () => Math.random().toString(36).slice(2, 10);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the count lives in the database and resets when the window ends", async () => {
  const key = `test:${uid()}`;
  assert.equal((await sharedRateLimit({ key, limit: 2, windowMs: 400 })).ok, true);
  assert.equal((await sharedRateLimit({ key, limit: 2, windowMs: 400 })).ok, true);
  const blocked = await sharedRateLimit({ key, limit: 2, windowMs: 400 });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
  assert.equal(row.count, 3);

  await new Promise((r) => setTimeout(r, 450));
  const fresh = await sharedRateLimit({ key, limit: 2, windowMs: 400 });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.remaining, 1);
  await prisma.rateLimitBucket.delete({ where: { key } });
});

test("concurrent requests are counted exactly once each", async () => {
  const key = `test:${uid()}`;
  const results = await Promise.all(Array.from({ length: 12 }, () => sharedRateLimit({ key, limit: 10, windowMs: 60_000 })));
  assert.equal(results.filter((r) => r.ok).length, 10);
  assert.equal((await prisma.rateLimitBucket.findUnique({ where: { key } })).count, 12);
  await prisma.rateLimitBucket.delete({ where: { key } });
});

test("customer links answer 429 with Retry-After once one address floods them", async () => {
  const ip = `203.0.113.${Math.floor(Math.random() * 200)}-${uid()}`;
  const request = new Request("https://orvius.im/api/public/deposit/x", { method: "POST", headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 20; i += 1) assert.equal(await publicTokenLimited(request, "deposit", "POST"), null);
  const limited = await publicTokenLimited(request, "deposit", "POST");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("Retry-After")) >= 1);
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: ip } } });
});

test("every public token route, test alerts and confirmation texts are limited", () => {
  for (const route of ["confirm", "deposit", "estimate", "tech", "calendar"]) {
    assert.match(read(`src/app/api/public/${route}/[token]/route.ts`), /publicTokenLimited\(request, "/);
  }
  assert.match(read("src/app/api/account/test-alert/route.ts"), /sharedRateLimit\(\{ key: `test-alert:/);
  assert.match(read("src/app/api/jobs/[id]/confirm-sms/route.ts"), /sharedRateLimit\(\{ key: `confirm-sms:/);
  for (const path of ["auth/magic-link", "onboarding", "waitlist", "ask", "copilot"]) {
    assert.match(read(`src/app/api/${path}/route.ts`), /await sharedRateLimit\(/);
  }
});

test.after(() => prisma.$disconnect());
