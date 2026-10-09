import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createScriptPrisma } from "./lib/db.mjs";

const prisma = createScriptPrisma();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const env = { AUTH_SECRET: "a".repeat(40), CRON_SECRET: "c".repeat(40) };

test("the app and the restore script derive the same backup key, and neither works from one secret", async () => {
  const app = await import("../src/lib/db-backup.ts");
  const script = await import("./db-backup.mjs");
  assert.equal(app.backupPassphrase(env), script.backupPassphrase(env));
  assert.equal(app.backupPassphrase({ CRON_SECRET: env.CRON_SECRET }), null, "GitHub's secret alone is not the key");
  assert.equal(app.backupPassphrase({ AUTH_SECRET: env.AUTH_SECRET }), null);
  assert.equal(app.backupPassphrase({ ...env, BACKUP_ENCRYPTION_KEY: "k".repeat(32) }), "k".repeat(32));
  assert.equal(app.backupPassphrase({ BACKUP_ENCRYPTION_KEY: "short" }), null);
});

test("the backup endpoint returns only encrypted bytes it has already restore-drilled", async () => {
  const saved = { auth: process.env.AUTH_SECRET, cron: process.env.CRON_SECRET, key: process.env.BACKUP_ENCRYPTION_KEY };
  Object.assign(process.env, env);
  delete process.env.BACKUP_ENCRYPTION_KEY;
  try {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../src/app/api/cron/backup/route.ts");
    const res = await GET(new NextRequest("http://localhost/api/cron/backup", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("x-orvius-backup"), /restored=ok/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "ORVB1", "encrypted, never plain JSON");
    assert.doesNotMatch(bytes.toString("latin1"), /"Business"/);
    const script = await import("./db-backup.mjs");
    const { decryptDump } = await import("../src/lib/db-backup.ts");
    const dump = decryptDump(bytes, script.backupPassphrase(env));
    assert.ok(dump.tables.some((t) => t.name === "Business"));
    assert.equal(dump.tables.find((t) => t.name === "Business").rows.length, await prisma.business.count());
  } finally {
    for (const [k, v] of [["AUTH_SECRET", saved.auth], ["CRON_SECRET", saved.cron], ["BACKUP_ENCRYPTION_KEY", saved.key]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("the backup endpoint refuses unsigned requests against a live database", async () => {
  const saved = { db: process.env.DATABASE_URL, secret: process.env.CRON_SECRET };
  process.env.DATABASE_URL = "libsql://orvius-prod.turso.io";
  process.env.CRON_SECRET = "s".repeat(40);
  try {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../src/app/api/cron/backup/route.ts");
    assert.equal((await GET(new NextRequest("http://localhost/api/cron/backup"))).status, 401);
  } finally {
    process.env.DATABASE_URL = saved.db;
    if (saved.secret) process.env.CRON_SECRET = saved.secret;
    else delete process.env.CRON_SECRET;
  }
});

test("a late alert drain is made up by live traffic, not only line watch", async () => {
  const backstop = await import("../src/lib/cron-backstop.ts");
  const now = new Date();
  await prisma.cronRun.deleteMany({});
  await prisma.cronRun.create({ data: { name: "alert-drain", lastRunAt: new Date(now.getTime() - 3600_000) } });
  await prisma.cronRun.create({ data: { name: "line-watch", lastRunAt: now } });
  backstop.resetBackstopThrottleForTests();
  await backstop.backstopLateSweeps("test", now);
  const row = await prisma.cronRun.findUnique({ where: { name: "alert-drain" } });
  assert.ok(now.getTime() - row.lastRunAt.getTime() < 60_000, "the drain ran and stamped itself");
  await prisma.cronRun.deleteMany({});
});

test("the schedules don't depend on GitHub firing every five minutes", () => {
  const beat = read(".github/workflows/sweep-heartbeat.yml");
  assert.match(beat, /timeout-minutes: 355/);
  assert.match(beat, /call alert-drain/);
  assert.match(beat, /call line-watch/);
  assert.match(beat, /cancel-in-progress: false/);
  assert.match(read("src/app/api/status/route.ts"), /scheduleBackstop\("status"\)/);
  assert.match(read("src/app/api/webhooks/twilio/sms/route.ts"), /scheduleBackstop\("twilio\.sms"\)/);
  const backup = read(".github/workflows/backup.yml");
  assert.match(backup, /\/api\/cron\/backup/);
  assert.match(backup, /restored=ok/);
});

test.after(() => prisma.$disconnect());
