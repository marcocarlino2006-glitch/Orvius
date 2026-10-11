#!/usr/bin/env node
/*
 * The rate limiter on the database driver production runs (libsql), not the
 * built-in SQLite engine the rest of the suite uses. On libsql the epoch-ms
 * window was bound as a float and read back as an error, so every fail-closed
 * limit refused: magic links, password resets and public texts all answered
 * "too many requests" to the first request.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";

const file = join(mkdtempSync(join(tmpdir(), "orvius-rl-")), "rl.db");
const db = createClient({ url: `file:${file}` });
await db.execute(`CREATE TABLE "RateLimitBucket" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "resetAtMs" BIGINT NOT NULL)`);

process.env.DATABASE_URL = `file:${file}`;
process.env.PRISMA_SQLITE_ADAPTER = "libsql";
const { sharedRateLimit } = await import("../src/lib/rate-limit.ts");
const { prisma } = await import("../src/lib/prisma.ts");

test.after(async () => {
  await prisma.$disconnect();
  db.close();
});

test("on libsql a fail-closed limit lets the first requests through and stops past the limit", async () => {
  const key = `libsql:${Date.now()}`;
  const seen = [];
  for (let i = 0; i < 4; i++) seen.push((await sharedRateLimit({ key, limit: 2, windowMs: 60 * 60_000, failClosed: true })).ok);
  assert.deepEqual(seen, [true, true, false, false]);
  const blocked = await sharedRateLimit({ key, limit: 2, windowMs: 60 * 60_000, failClosed: true });
  assert.ok(blocked.retryAfterSec > 30, "a real window, not the 30-second store-down refusal");
});

test("a window already stored as a float is read and counted, not refused", async () => {
  await db.execute(`INSERT INTO "RateLimitBucket" ("key", "count", "resetAtMs") VALUES ('legacy', 1, ${Date.now() + 3_600_000}.0)`);
  const result = await sharedRateLimit({ key: "legacy", limit: 10, windowMs: 60 * 60_000, failClosed: true });
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 8);
});
